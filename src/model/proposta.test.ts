import { beforeEach, describe, expect, it } from 'vitest'
import { terreno } from '../data/terreno'
import { contains, dist, sobrepoe, type Vec2 } from '../geo/polygon'
import { areaInvadida, pegada, poligonoInvade } from './protecao'
import { arvoresIniciais } from './arvores'
import { contorno, type Elemento } from './elementos'
import { propostaVinicola } from './propostaVinicola'
import { setasDoFluxo } from './fluxos'
import { migrarProjeto, useProjeto } from '../state/projeto'

const proposta = propostaVinicola()
const elementos = proposta.elementos.map((e, i) => ({ ...e, id: `E${i + 1}` })) as Elemento[]
const arvores = arvoresIniciais()
/** Pontos a cada metro ao longo do caminho. */
const amostrar = (pts: Vec2[]) =>
  pts.slice(1).flatMap((b, i) => {
    const a = pts[i], n = Math.max(1, Math.ceil(dist(a, b)))
    return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as Vec2)
  })
const tanques = (d: number) => elementos.filter((e) => e.tipo === 'tanque' && e.largura === d)

describe('proposta da vinícola', () => {
  it('tem o programa pedido: pavilhão de 1.800 m², 50 tanques de 4,5 m e 100 de 2,5 m', () => {
    const pav = elementos.filter((e) => e.tipo === 'galpao')
    expect(pav).toHaveLength(1)
    expect(pav[0].largura * pav[0].comprimento).toBe(1800)
    expect(tanques(4.5)).toHaveLength(50)
    expect(tanques(2.5)).toHaveLength(100)
    expect(elementos.filter((e) => e.tipo === 'portao')).toHaveLength(1)
    expect(elementos.filter((e) => e.nome.startsWith('Balança'))).toHaveLength(2)
    expect(proposta.pisos.some((p) => p.material === 'asfalto')).toBe(true)
    expect(proposta.fluxos.length).toBeGreaterThanOrEqual(2)
  })

  it('nada fica fora do lote, no recuo, na reserva, na compensação ou em cima de árvore', () => {
    for (const e of elementos) {
      const p = pegada(e)
      expect(p.every((q) => contains(terreno.perimetro, q)), e.nome).toBe(true)
      expect(sobrepoe(p, terreno.recuo.poligono), e.nome).toBe(false)
      expect(areaInvadida(e), e.nome).toBeUndefined()
      const pertoDemais = arvores.find((a) => (e.tipo === 'tanque' ? dist([a.x, a.y], [e.x, e.y]) < e.largura / 2 + 0.5 : contains(contorno(e), [a.x, a.y])))
      expect(pertoDemais, e.nome).toBeUndefined()
    }
  })

  it('um elemento não encosta no outro', () => {
    const tq = elementos.filter((e) => e.tipo === 'tanque')
    for (let i = 0; i < tq.length; i++)
      for (let j = i + 1; j < tq.length; j++) {
        const a = tq[i], b = tq[j]
        expect(dist([a.x, a.y], [b.x, b.y]), `${a.nome} × ${b.nome}`).toBeGreaterThanOrEqual(a.largura / 2 + b.largura / 2 + 0.5)
      }
    const resto = elementos.filter((e) => e.tipo !== 'tanque')
    for (const a of resto) for (const b of elementos) if (a !== b) expect(sobrepoe(pegada(a), pegada(b)), `${a.nome} × ${b.nome}`).toBe(false)
  })

  it('o chão pintado fica dentro do lote, fora das áreas protegidas e sem cobrir árvores', () => {
    for (const p of proposta.pisos) {
      expect(p.pontos.length, p.nome).toBeGreaterThanOrEqual(3)
      expect(p.pontos.every((q) => contains(terreno.perimetro, q)), p.nome).toBe(true)
      expect(poligonoInvade(p.pontos), p.nome).toBeUndefined()
      expect(arvores.find((a) => contains(p.pontos, [a.x, a.y])), p.nome).toBeUndefined()
    }
  })

  it('as carretas entram e saem pelo portão, vindo da estrada de terra', () => {
    const portao = elementos.find((e) => e.tipo === 'portao')!
    for (const f of proposta.fluxos) {
      const fora = (q: Vec2) => !contains(terreno.perimetro, q)
      expect(fora(f.pontos[0]), f.nome).toBe(true)
      expect(fora(f.pontos[f.pontos.length - 1]), f.nome).toBe(true)
      // Passa duas vezes perto do portão (entrada e saída) e por dentro das balanças.
      const pertoDoPortao = f.pontos.filter((q) => dist(q, [portao.x, portao.y]) < portao.comprimento / 2 + 3)
      expect(pertoDoPortao.length, f.nome).toBeGreaterThanOrEqual(2)
      for (const nome of ['Balança de entrada', 'Balança de saída']) {
        const b = elementos.find((e) => e.nome === nome)!
        expect(amostrar(f.pontos).some((q) => contains(contorno(b), q)), `${f.nome} / ${nome}`).toBe(true)
      }
    }
  })
})

describe('setas do fluxo', () => {
  it('uma a cada espaço e uma no fim, apontando para onde se anda', () => {
    const s = setasDoFluxo([[0, 0], [100, 0], [100, 50]], 40)
    expect(s.map((x) => x.p)).toEqual([[20, 0], [60, 0], [100, 0], [100, 50]])
    expect(s[0].ang).toBe(0)
    expect(s[s.length - 1].ang).toBeCloseTo(Math.PI / 2)
  })
})

describe('carregar a proposta e editar caminhos', () => {
  beforeEach(() => useProjeto.setState({ elementos: [], pisos: [], fluxos: [], historico: [], selecao: null }))

  it('troca o que havia, com ids novos, e um Cmd+Z volta', () => {
    const id = useProjeto.getState().adicionarElemento('galpao', 60, 40)
    useProjeto.getState().carregarProposta(propostaVinicola())
    const s = useProjeto.getState()
    expect(s.elementos).toHaveLength(proposta.elementos.length)
    expect(new Set(s.elementos.map((e) => e.id)).size).toBe(s.elementos.length)
    expect(s.pisos.map((p) => p.id)).toEqual(proposta.pisos.map((_, i) => `S${i + 1}`))
    expect(s.fluxos.map((f) => f.id)).toEqual(proposta.fluxos.map((_, i) => `F${i + 1}`))
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().elementos.map((e) => e.id)).toEqual([id])
    expect(useProjeto.getState().fluxos).toEqual([])
  })

  it('move um ponto do caminho, apaga e desfaz', () => {
    useProjeto.getState().carregarProposta(propostaVinicola())
    const f = useProjeto.getState().fluxos[0]
    useProjeto.getState().editarFluxo(f.id, { pontos: f.pontos.map((p, i) => (i === 0 ? ([0, -20] as Vec2) : p)) })
    expect(useProjeto.getState().fluxos[0].pontos[0]).toEqual([0, -20])
    useProjeto.getState().selecionar({ tipo: 'fluxo', id: f.id })
    useProjeto.getState().removerFluxo(f.id)
    expect(useProjeto.getState().fluxos.find((x) => x.id === f.id)).toBeUndefined()
    useProjeto.getState().desfazer()
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().fluxos[0].pontos[0]).toEqual(f.pontos[0])
  })

  it('projetos antigos ganham a lista de caminhos vazia e mantêm o resto', () => {
    const e = { id: 'E1', tipo: 'galpao', nome: 'Galpão 1', x: 60, y: 40, rot: 0, largura: 30, comprimento: 50, altura: 10, cor: '#ccc' }
    const m = migrarProjeto({ elementos: [e], pisos: [], arvores: [] }, 6)
    expect(m.fluxos).toEqual([])
    expect(m.elementos).toEqual([e])
  })
})
