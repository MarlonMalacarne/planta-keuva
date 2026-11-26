import { beforeEach, describe, expect, it } from 'vitest'
import { useProjeto } from './projeto'
import { ElevationModel } from '../geo/elevation'

describe('cotas editáveis', () => {
  beforeEach(() => useProjeto.getState().restaurarCotasDaFoto())

  it('adiciona, edita e desfaz', () => {
    const p = useProjeto.getState()
    const n = p.cotas.length
    const id = p.adicionarCota(50, 60, 777)
    expect(useProjeto.getState().cotas).toHaveLength(n + 1)
    expect(useProjeto.getState().selecao).toEqual({ tipo: 'cota', id })
    useProjeto.getState().editarCota(id, { z: 778.5 })
    expect(useProjeto.getState().cotas.find((c) => c.id === id)?.z).toBe(778.5)
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().cotas.find((c) => c.id === id)?.z).toBe(777)
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().cotas).toHaveLength(n)
  })

  it('o relevo passa pela cota inserida à mão', () => {
    const id = useProjeto.getState().adicionarCota(60, 50, 781.25)
    const c = useProjeto.getState().cotas.find((c) => c.id === id)!
    expect(new ElevationModel(useProjeto.getState().cotas).at(c.x, c.y)).toBeCloseTo(781.25, 6)
  })

  it('não deixa ficar com menos de 3 pontos', () => {
    const s = useProjeto.getState()
    for (const c of [...s.cotas]) useProjeto.getState().removerCota(c.id)
    expect(useProjeto.getState().cotas).toHaveLength(3)
  })
})

describe('elementos', () => {
  beforeEach(() => useProjeto.setState({ elementos: [], historico: [], selecao: null }))

  it('adiciona com medidas do catálogo e seleciona', () => {
    const id = useProjeto.getState().adicionarElemento('galpao', 10, 20)
    const e = useProjeto.getState().elementos[0]
    expect(e).toMatchObject({ id, tipo: 'galpao', x: 10, y: 20, largura: 30, comprimento: 50, nome: 'Galpão 1' })
    expect(useProjeto.getState().selecao).toEqual({ tipo: 'elemento', id })
  })

  it('edita, duplica, apaga e desfaz', () => {
    const p = () => useProjeto.getState()
    const id = p().adicionarElemento('predio', 0, 0)
    p().editarElemento(id, { largura: 18, rot: 30 })
    expect(p().elementos[0]).toMatchObject({ largura: 18, rot: 30 })
    const copia = p().duplicarElemento(id)!
    expect(p().elementos).toHaveLength(2)
    expect(p().elementos[1]).toMatchObject({ id: copia, largura: 18, nome: 'Prédio 2' })
    p().removerElemento(id)
    expect(p().elementos.map((e) => e.id)).toEqual([copia])
    p().desfazer()
    expect(p().elementos).toHaveLength(2)
  })

  it('tanque mantém largura e comprimento iguais (diâmetro)', () => {
    const id = useProjeto.getState().adicionarElemento('tanque', 0, 0)
    useProjeto.getState().editarElemento(id, { largura: 12 })
    expect(useProjeto.getState().elementos[0]).toMatchObject({ largura: 12, comprimento: 12 })
  })
})

describe('contorno do elemento', () => {
  it('gira os cantos em torno do centro', async () => {
    const { contorno } = await import('../model/elementos')
    const c = contorno({ id: 'x', tipo: 'caixa', nome: '', x: 0, y: 0, rot: 90, largura: 4, comprimento: 2, altura: 1, cor: '' })
    // Girado 90°: a largura (4 m) passa a ficar no eixo norte-sul.
    const ys = c.map((p) => p[1])
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6)
  })
})

describe('lugar livre', () => {
  it('coloca elementos sem sobrepor e dentro da área construível', async () => {
    const { lugarLivre, contorno } = await import('../model/elementos')
    const { terreno } = await import('../data/terreno')
    const { contains } = await import('../geo/polygon')
    const areas = { lote: terreno.perimetro, proibidas: [terreno.recuo.poligono, terreno.mata.poligono] }
    const p = () => useProjeto.getState()
    useProjeto.setState({ elementos: [] })
    for (const [t, w, l] of [['galpao', 30, 50], ['predio', 15, 25], ['tanque', 8, 8]] as const) {
      const pos = lugarLivre(w, l, p().elementos, areas, [60, 45])
      expect(pos).not.toBeNull()
      p().adicionarElemento(t, pos![0], pos![1])
    }
    const [g, pr] = p().elementos
    for (const c of [...contorno(g), ...contorno(pr)]) expect(contains(terreno.perimetro, c)).toBe(true)
    const sobrepoe = (a: typeof g, b: typeof g) => Math.abs(a.x - b.x) < (a.largura + b.largura) / 2 && Math.abs(a.y - b.y) < (a.comprimento + b.comprimento) / 2
    expect(sobrepoe(g, pr)).toBe(false)
    expect(sobrepoe(g, p().elementos[2])).toBe(false)
  })
})
