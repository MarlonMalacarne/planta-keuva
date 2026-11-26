import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'
import { terreno, extensao } from '../data/terreno'
import type { Vec2 } from '../geo/polygon'
import { ElevationModel, type Cota } from '../geo/elevation'
import { catalogo, type Elemento, type TipoElemento } from '../model/elementos'

export type { Cota, Elemento }

const cotasDaFoto: Cota[] = terreno.cotas.map((c) => ({ ...c, origem: 'foto' as const }))

export type Selecao = { tipo: 'cota' | 'elemento'; id: string } | null

interface Foto {
  cotas: Cota[]
  elementos: Elemento[]
}

interface Projeto extends Foto {
  historico: Foto[]
  selecao: Selecao
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
      const foto = (): Foto => ({ cotas: get().cotas, elementos: get().elementos })
      const comHistorico = (mudanca: Partial<Foto>) => ({
        ...mudanca,
        historico: [...get().historico, foto()].slice(-LIMITE_HISTORICO),
      })
      return {
        cotas: cotasDaFoto,
        elementos: [],
        historico: [],
        selecao: null,
        selecionar: (selecao) => set({ selecao }),
        marcar: () => set({ historico: [...get().historico, foto()].slice(-LIMITE_HISTORICO) }),
        desfazer: () => {
          const h = get().historico
          if (!h.length) return
          const anterior = h[h.length - 1]
          const s = get().selecao
          const aindaExiste = s && (s.tipo === 'cota' ? anterior.cotas : anterior.elementos).some((x) => x.id === s.id)
          set({ ...anterior, historico: h.slice(0, -1), selecao: aindaExiste ? s : null })
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
          const elementos = get().elementos.map((e) => {
            if (e.id !== id) return e
            const n = { ...e, ...dados }
            if (n.tipo === 'tanque') {
              // Tanque é redondo: largura e comprimento são o mesmo diâmetro.
              const d = dados.comprimento !== undefined && dados.largura === undefined ? n.comprimento : n.largura
              n.largura = n.comprimento = d
            }
            return n
          })
          set(registrar ? comHistorico({ elementos }) : { elementos })
        },
        duplicarElemento: (id) => {
          const e = get().elementos.find((x) => x.id === id)
          if (!e) return null
          const novoId = proximoId('E', get().elementos)
          const copia = { ...e, id: novoId, nome: proximoNome(catalogo[e.tipo].nome, get().elementos), x: e.x + 5, y: e.y - 5 }
          set({ ...comHistorico({ elementos: [...get().elementos, copia] }), selecao: { tipo: 'elemento', id: novoId } })
          return novoId
        },
        removerElemento: (id) => set({ ...comHistorico({ elementos: get().elementos.filter((e) => e.id !== id) }), selecao: null }),
      }
    },
    {
      name: 'planta-keuva:projeto',
      version: 2,
      partialize: ({ cotas, elementos }) => ({ cotas, elementos }),
      // v1 (0.1.0) só tinha cotas.
      migrate: (salvo, versao) => {
        const s = (salvo ?? {}) as Partial<Foto>
        if (versao < 2) return { cotas: s.cotas ?? cotasDaFoto, elementos: [] }
        return s as Foto
      },
    },
  ),
)

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
