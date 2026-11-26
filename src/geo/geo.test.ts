import { describe, expect, it } from 'vitest'
import { area, contains, dist, length, scatter, sobrepoe, type Vec2 } from './polygon'
import { ElevationModel, contours } from './elevation'
import { terreno, areasProtegidas, calcularResumo, elevacaoDaFoto as elevacao } from '../data/terreno'

function distSegmento(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

const resumo = calcularResumo(elevacao)

describe('polígonos', () => {
  const quadrado: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
  it('calcula área e perímetro', () => {
    expect(area(quadrado)).toBe(100)
    expect(length(quadrado, true)).toBe(40)
  })
  it('testa ponto dentro', () => {
    expect(contains(quadrado, [5, 5])).toBe(true)
    expect(contains(quadrado, [15, 5])).toBe(false)
  })
  it('espalha pontos só dentro', () => {
    const pts = scatter(quadrado, 2, 7)
    expect(pts.length).toBeGreaterThan(10)
    expect(pts.every((p) => contains(quadrado, p))).toBe(true)
  })
})

describe('terreno real', () => {
  it('área bate com a do levantamento (20.200 m²) com erro < 0,5%', () => {
    expect(Math.abs(resumo.areaTotal - terreno.areaOficialM2) / terreno.areaOficialM2).toBeLessThan(0.005)
  })
  it('lados retos batem com as medidas da foto (erro < 15 cm)', () => {
    const v = terreno.vertices
    for (const l of terreno.lados.filter((l) => !l.curva)) {
      expect(Math.abs(dist(v[l.de], v[l.para]) - l.m)).toBeLessThan(0.15)
    }
  })
  it('divisa curva com a rodovia mede ~196,54 m', () => {
    expect(Math.abs(length(terreno.divisaRodovia) - 196.54)).toBeLessThan(0.5)
  })
  it('recuo e mata ficam dentro do lote', () => {
    expect(resumo.areaRecuo).toBeGreaterThan(900)
    expect(resumo.areaLivre).toBeGreaterThan(0)
  })
  it('reserva legal e compensação têm as áreas do laudo e ficam dentro do lote', () => {
    expect(Math.abs(area(terreno.reservaLegal.poligono) - 4000)).toBeLessThan(2)
    expect(Math.abs(area(terreno.compensacao.poligono) - 600)).toBeLessThan(2)
    for (const a of areasProtegidas) {
      // vértices dentro do lote ou em cima da divisa
      for (const p of a.poligono) {
        const naDivisa = terreno.perimetro.some((q, i) => distSegmento(p, q, terreno.perimetro[(i + 1) % terreno.perimetro.length]) < 0.05)
        expect(contains(terreno.perimetro, p) || naDivisa).toBe(true)
      }
    }
    // Nenhum ponto fica em duas áreas ao mesmo tempo (a área livre não desconta nada duas vezes).
    const listas = [terreno.recuo.poligono, ...areasProtegidas.map((a) => a.poligono)]
    for (let x = -50.25; x < 120; x += 0.5)
      for (let y = 0.25; y < 195; y += 0.5) expect(listas.filter((l) => contains(l, [x, y])).length).toBeLessThan(2)
    expect(resumo.areaLivre).toBeCloseTo(area(terreno.perimetro) - resumo.areaRecuo - 4000 - 600, -1)
  })
  it('sobreposição de polígonos', () => {
    const q = (x: number, y: number, l: number): Vec2[] => [[x, y], [x + l, y], [x + l, y + l], [x, y + l]]
    expect(sobrepoe(q(0, 0, 10), q(5, 5, 10))).toBe(true)
    expect(sobrepoe(q(0, 0, 10), q(2, 2, 2))).toBe(true)
    expect(sobrepoe(q(0, 0, 10), q(11, 0, 10))).toBe(false)
    // cruz: nenhum vértice dentro do outro, mas as bordas se cortam
    expect(sobrepoe([[-10, -1], [10, -1], [10, 1], [-10, 1]], [[-1, -10], [1, -10], [1, 10], [-1, 10]])).toBe(true)
  })
})

describe('elevação', () => {
  it('passa exatamente pelas cotas medidas', () => {
    for (const c of terreno.cotas) expect(elevacao.at(c.x, c.y)).toBeCloseTo(c.z, 6)
  })
  it('recupera um plano inclinado', () => {
    const pts = [[0, 0], [10, 0], [0, 10], [10, 10], [5, 3]].map(([x, y], i) => ({ id: String(i), x, y, z: 100 + 0.1 * x - 0.2 * y }))
    const m = new ElevationModel(pts)
    expect(m.at(7, 7)).toBeCloseTo(100 + 0.7 - 1.4, 6)
  })
  it('gera curvas de nível', () => {
    const pts = [[0, 0], [10, 0], [0, 10], [10, 10]].map(([x, y], i) => ({ id: String(i), x, y, z: x }))
    const m = new ElevationModel(pts)
    const c = contours(m.grid(0, 0, 10, 10, 1), 2)
    expect(c.map((l) => l.level)).toEqual([0, 2, 4, 6, 8, 10])
    expect(c[2].segments.length).toBeGreaterThan(5)
  })
})
