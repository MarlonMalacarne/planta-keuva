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

describe('esticar e girar (alças)', () => {
  const base = { id: 'g', tipo: 'galpao' as const, nome: '', x: 0, y: 0, rot: 0, largura: 30, comprimento: 50, altura: 10, cor: '' }

  it('puxar uma face mantém a face oposta parada', async () => {
    const { esticar, contorno } = await import('../model/elementos')
    const d = esticar(base, 'x+', 5)
    expect(d).toMatchObject({ largura: 35, x: 2.5, y: 0 })
    // a face oeste continua em x = -15
    const xs = contorno({ ...base, ...d }).map((p) => p[0])
    expect(Math.min(...xs)).toBeCloseTo(-15, 6)
    expect(esticar(base, 'y-', 4.2)).toMatchObject({ comprimento: 54, y: -2 })
  })

  it('respeita o giro do elemento e a medida mínima', async () => {
    const { esticar } = await import('../model/elementos')
    // Girado 90°: a largura aponta para o norte, então puxar x+ desloca o centro em Y.
    const d = esticar({ ...base, rot: 90 }, 'x+', 10)
    expect(d.largura).toBe(40)
    expect(d.x).toBeCloseTo(0, 6)
    expect(d.y).toBeCloseTo(5, 6)
    expect(esticar(base, 'x-', -100).largura).toBe(0.5)
  })

  it('tanque cresce em volta do centro', async () => {
    const { esticar } = await import('../model/elementos')
    const t = { ...base, tipo: 'tanque' as const, largura: 8, comprimento: 8 }
    expect(esticar(t, 'x+', 1)).toEqual({ largura: 10, comprimento: 10 })
  })

  it('gira em passos de 5° e volta para 0–360', async () => {
    const { girar, difAngulo } = await import('../model/elementos')
    expect(girar(base, 33)).toEqual({ rot: 35 })
    expect(girar({ ...base, rot: 350 }, 22, 1)).toEqual({ rot: 12 })
    expect(difAngulo(170, -170)).toBe(20)
  })
})

describe('árvores', () => {
  beforeEach(() => useProjeto.getState().restaurarMata())

  it('a mata vira árvores editáveis', () => {
    const { arvores } = useProjeto.getState()
    expect(arvores.length).toBeGreaterThan(100)
    expect(new Set(arvores.map((a) => a.id)).size).toBe(arvores.length)
  })

  it('move um grupo, apaga e desfaz', () => {
    const p = () => useProjeto.getState()
    const [a, b] = p().arvores
    p().editarArvores({ [a.id]: { x: a.x + 3 }, [b.id]: { x: b.x + 3 } })
    expect(p().arvores[0].x).toBeCloseTo(a.x + 3, 6)
    const n = p().arvores.length
    p().selecionar({ tipo: 'arvores', ids: [a.id, b.id] })
    p().removerArvores([a.id, b.id])
    expect(p().arvores).toHaveLength(n - 2)
    expect(p().selecao).toBeNull()
    p().desfazer()
    expect(p().arvores).toHaveLength(n)
    p().desfazer()
    expect(p().arvores[0].x).toBeCloseTo(a.x, 6)
  })

  it('adiciona uma árvore nova com id livre', () => {
    const p = () => useProjeto.getState()
    const n = p().arvores.length
    const id = p().adicionarArvore(60, 40)
    expect(p().arvores).toHaveLength(n + 1)
    expect(p().selecao).toEqual({ tipo: 'arvores', ids: [id] })
  })

  it('quem já usava a versão 0.2.0 mantém cotas e elementos e ganha as árvores', async () => {
    const { migrarProjeto } = await import('./projeto')
    const migrado = migrarProjeto({ cotas: [{ id: 'P1', x: 0, y: 0, z: 1 }], elementos: [{ id: 'E1' }] })
    expect(migrado.cotas).toHaveLength(1)
    expect(migrado.elementos).toHaveLength(1)
    expect(migrado.arvores.length).toBeGreaterThan(100)
  })
})
