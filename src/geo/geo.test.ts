import { describe, expect, it } from 'vitest'
import { area, contains, dist, length, scatter, type Vec2 } from './polygon'
import { ElevationModel, contours } from './elevation'
import { terreno, calcularResumo, elevacaoDaFoto as elevacao } from '../data/terreno'

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
