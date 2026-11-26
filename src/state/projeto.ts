import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'
import { terreno, extensao } from '../data/terreno'
import type { Vec2 } from '../geo/polygon'
import { ElevationModel, type Cota } from '../geo/elevation'
import { catalogo, difAngulo, lugarLivre, type Elemento, type TipoElemento } from '../model/elementos'
import { arvoresDaMataMantida, arvoresIniciais, naAreaDeCorte, proximoIdArvore, type Arvore } from '../model/arvores'
import { areaInvadida, areasDeObra } from '../model/protecao'

export type { Cota, Elemento, Arvore }

const cotasDaFoto: Cota[] = terreno.cotas.map((c) => ({ ...c, origem: 'foto' as const }))

export type Selecao = { tipo: 'cota' | 'elemento'; id: string } | { tipo: 'arvores'; ids: string[] } | null

interface Foto {
  cotas: Cota[]
  elementos: Elemento[]
  arvores: Arvore[]
}

interface Projeto extends Foto {
  historico: Foto[]
  selecao: Selecao
  /** Recado rápido na tela (quando uma mudança é recusada, por exemplo). `n` muda a cada aviso. */
  aviso: { texto: string; n: number } | null
  avisar: (texto: string) => void
  selecionar: (s: Selecao) => void
  /** Guarda o estado atual no histórico (antes de arrastar algo, por exemplo). */
  marcar: () => void
  desfazer: () => void

  adicionarCota: (x: number, y: number, z: number) => string
  editarCota: (id: string, dados: Partial<Omit<Cota, 'id'>>, registrar?: boolean) => void
  removerCota: (id: string) => void
  restaurarCotasDaFoto: () => void

  adicionarElemento: (tipo: TipoElemento, x: number, y: number) => string
  editarElemento: (id: string, dados: Partial<Omit<Elemento, 'id'>>, registrar?: boolean) => void
  duplicarElemento: (id: string) => string | null
  removerElemento: (id: string) => void

  adicionarArvore: (x: number, y: number) => string
  /** Muda várias árvores de uma vez (mover um grupo, trocar a altura de todas...). */
  editarArvores: (mudancas: Record<string, Partial<Omit<Arvore, 'id'>>>, registrar?: boolean) => void
  removerArvores: (ids: string[]) => void
  /** Repõe as árvores do terreno (protegidas + mata fora do pedido de corte). */
  restaurarArvores: () => void
}

const LIMITE_HISTORICO = 100

function proximoId(prefixo: string, usados: { id: string }[]) {
  const ids = new Set(usados.map((c) => c.id))
  let n = 1
  while (ids.has(`${prefixo}${n}`)) n++
  return `${prefixo}${n}`
}

function proximoNome(base: string, elementos: Elemento[]) {
  const nomes = new Set(elementos.map((e) => e.nome))
  let n = 1
  while (nomes.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

// Dados do projeto ficam salvos no computador e sobrevivem às atualizações do app.
export const useProjeto = create<Projeto>()(
  persist(
    (set, get) => {
      const foto = (): Foto => ({ cotas: get().cotas, elementos: get().elementos, arvores: get().arvores })
      const comHistorico = (mudanca: Partial<Foto>) => ({
        ...mudanca,
        historico: [...get().historico, foto()].slice(-LIMITE_HISTORICO),
      })
      return {
        cotas: cotasDaFoto,
        elementos: [],
        arvores: arvoresIniciais(),
        historico: [],
        selecao: null,
        aviso: null,
        avisar: (texto) => set({ aviso: { texto, n: (get().aviso?.n ?? 0) + 1 } }),
        selecionar: (selecao) => set({ selecao }),
        marcar: () => set({ historico: [...get().historico, foto()].slice(-LIMITE_HISTORICO) }),
        desfazer: () => {
          const h = get().historico
          if (!h.length) return
          const anterior = h[h.length - 1]
          set({ ...anterior, historico: h.slice(0, -1), selecao: selecaoValida(get().selecao, anterior) })
        },

        adicionarCota: (x, y, z) => {
          const id = proximoId('P', get().cotas)
          set({ ...comHistorico({ cotas: [...get().cotas, { id, x, y, z, origem: 'manual' }] }), selecao: { tipo: 'cota', id } })
          return id
        },
        editarCota: (id, dados, registrar = true) => {
          const cotas = get().cotas.map((c) => (c.id === id ? { ...c, ...dados } : c))
          set(registrar ? comHistorico({ cotas }) : { cotas })
        },
        removerCota: (id) => {
          if (get().cotas.length <= 3) return // o relevo precisa de pelo menos 3 pontos
          set({ ...comHistorico({ cotas: get().cotas.filter((c) => c.id !== id) }), selecao: null })
        },
        restaurarCotasDaFoto: () => set({ ...comHistorico({ cotas: cotasDaFoto }), selecao: null }),

        adicionarElemento: (tipo, x, y) => {
          const m = catalogo[tipo]
          const id = proximoId('E', get().elementos)
          const novo: Elemento = {
            id, tipo, nome: proximoNome(m.nome, get().elementos), x, y, rot: 0,
            largura: m.largura, comprimento: m.comprimento, altura: m.altura, cor: m.cor,
          }
          set({ ...comHistorico({ elementos: [...get().elementos, novo] }), selecao: { tipo: 'elemento', id } })
          return id
        },
        editarElemento: (id, dados, registrar = true) => {
          const antes = get().elementos.find((e) => e.id === id)
          if (!antes) return
          const n = { ...antes, ...dados }
          if (n.tipo === 'tanque') {
            // Tanque é redondo: largura e comprimento são o mesmo diâmetro.
            const d = dados.comprimento !== undefined && dados.largura === undefined ? n.comprimento : n.largura
            n.largura = n.comprimento = d
          }
          // Não deixa entrar na reserva legal nem na compensação (quem já está dentro pode sair).
          // Num arrasto (registrar = false) o caminho também conta: o elemento para na borda em vez
          // de pular para o outro lado quando o mouse anda rápido.
          if (!areaInvadida(antes)) {
            const invadida = registrar ? areaInvadida(n) : invadeNoCaminho(antes, n)
            if (invadida) return get().avisar(`${invadida.nome}: área protegida, não dá para construir aí`)
          }
          const elementos = get().elementos.map((e) => (e.id === id ? n : e))
          set(registrar ? comHistorico({ elementos }) : { elementos })
        },
        duplicarElemento: (id) => {
          const e = get().elementos.find((x) => x.id === id)
          if (!e) return null
          const novoId = proximoId('E', get().elementos)
          let copia = { ...e, id: novoId, nome: proximoNome(catalogo[e.tipo].nome, get().elementos), x: e.x + 5, y: e.y - 5 }
          if (areaInvadida(copia)) {
            const lugar = lugarLivre(e.largura, e.comprimento, get().elementos, { ...areasDeObra, arvores: get().arvores }, [copia.x, copia.y])
            if (!lugar) {
              get().avisar('Não achei lugar livre para a cópia fora das áreas protegidas')
              return null
            }
            copia = { ...copia, x: lugar[0], y: lugar[1], rot: 0 }
          }
          set({ ...comHistorico({ elementos: [...get().elementos, copia] }), selecao: { tipo: 'elemento', id: novoId } })
          return novoId
        },
        removerElemento: (id) => set({ ...comHistorico({ elementos: get().elementos.filter((e) => e.id !== id) }), selecao: null }),

        adicionarArvore: (x, y) => {
          const id = proximoIdArvore(get().arvores)
          set({ ...comHistorico({ arvores: [...get().arvores, { id, x, y, altura: 9, copa: 6 }] }), selecao: { tipo: 'arvores', ids: [id] } })
          return id
        },
        editarArvores: (mudancas, registrar = true) => {
          const arvores = get().arvores.map((a) => (mudancas[a.id] ? { ...a, ...mudancas[a.id] } : a))
          set(registrar ? comHistorico({ arvores }) : { arvores })
        },
        removerArvores: (ids) => {
          const fora = new Set(ids)
          set({ ...comHistorico({ arvores: get().arvores.filter((a) => !fora.has(a.id)) }), selecao: null })
        },
        restaurarArvores: () => set({ ...comHistorico({ arvores: arvoresIniciais() }), selecao: null }),
      }
    },
    {
      name: 'planta-keuva:projeto',
      version: 5,
      partialize: ({ cotas, elementos, arvores }) => ({ cotas, elementos, arvores }),
      migrate: migrarProjeto,
    },
  ),
)

/**
 * v1 (0.1.0) só tinha cotas; v2 (0.2.0) não tinha as árvores como objetos; v3 tinha a mata
 * inteira; v4 só as árvores protegidas. A partir da v5 saem só as árvores do pedido de corte.
 */
export function migrarProjeto(salvo: unknown, versao = 0): Foto {
  const s = (salvo ?? {}) as Partial<Foto>
  let arvores = s.arvores ?? arvoresIniciais()
  if (s.arvores && versao < 4) arvores = arvores.filter((a) => !naAreaDeCorte(a))
  else if (s.arvores && versao === 4) arvores = [...arvores, ...arvoresDaMataMantida(arvores)]
  return { cotas: s.cotas ?? cotasDaFoto, elementos: s.elementos ?? [], arvores }
}

/** Primeira área protegida tocada indo de `a` até `b` em passos de até 1 m (ou 2°). */
function invadeNoCaminho(a: Elemento, b: Elemento) {
  const giro = difAngulo(a.rot, b.rot)
  const passos = Math.ceil(Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.abs(b.largura - a.largura), Math.abs(b.comprimento - a.comprimento), Math.abs(giro) / 2))
  for (let k = 1; k <= passos; k++) {
    const t = k / passos
    const m = (u: number, v: number) => u + (v - u) * t
    const invadida = areaInvadida({ ...b, x: m(a.x, b.x), y: m(a.y, b.y), largura: m(a.largura, b.largura), comprimento: m(a.comprimento, b.comprimento), rot: a.rot + giro * t })
    if (invadida) return invadida
  }
  return areaInvadida(b)
}

/** Mantém só a parte da seleção que ainda existe (depois de desfazer, por exemplo). */
function selecaoValida(s: Selecao, f: Foto): Selecao {
  if (!s) return null
  if (s.tipo === 'arvores') {
    const ids = new Set(f.arvores.map((a) => a.id))
    const restam = s.ids.filter((id) => ids.has(id))
    return restam.length ? { tipo: 'arvores', ids: restam } : null
  }
  return (s.tipo === 'cota' ? f.cotas : f.elementos).some((x) => x.id === s.id) ? s : null
}

/** Modelo de relevo recalculado sempre que as cotas mudam. */
export function useElevacao() {
  const cotas = useProjeto((p) => p.cotas)
  return useMemo(() => new ElevationModel(cotas, cobertura), [cotas])
}

/** Cantos e meios das bordas da área de trabalho + vértices do lote. */
const cobertura: Vec2[] = (() => {
  const e = extensao, m = 20
  const xs = [e.minX - m, (e.minX + e.maxX) / 2, e.maxX + m]
  const ys = [e.minY - m, (e.minY + e.maxY) / 2, e.maxY + m]
  const borda = xs.flatMap((x) => ys.map((y) => [x, y] as Vec2)).filter(([x, y]) => x !== xs[1] || y !== ys[1])
  return [...borda, ...Object.values(terreno.vertices)]
})()

/** Ponto padrão para colocar um elemento novo: meio da área aberta, ao sul. */
export const PONTO_INICIAL: Vec2 = [60, 45]
