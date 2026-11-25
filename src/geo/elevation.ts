import Delaunator from 'delaunator'
import type { Vec2 } from './polygon'

export interface Cota {
  id: string
  x: number
  y: number
  z: number
  /** 'foto' = lida do levantamento; 'manual' = inserida no app. */
  origem?: 'foto' | 'manual'
  nota?: string
}

/**
 * Modelo de elevação, como na topografia:
 * - Dentro da área coberta pelos pontos: malha de triângulos (TIN / Delaunay)
 *   com interpolação linear. Passa exatamente pelas cotas e não cria "morros".
 * - Fora dela: plano de tendência (mínimos quadrados) + resíduos por inverso
 *   da distância, para estender o relevo de forma suave.
 */
export class ElevationModel {
  private a = 0
  private b = 0
  private c = 0
  private res: { x: number; y: number; r: number }[]
  readonly min: number
  readonly max: number
  /** Triângulos da TIN: índices dos pontos, de 3 em 3. */
  readonly triangulos: Uint32Array | number[]
  private caixas: Float64Array

  /** Pontos medidos + pontos auxiliares (extrapolados) usados na TIN. */
  private malha: Cota[]

  /**
   * @param cobertura pontos extras (ex.: cantos da área de trabalho) onde a cota é
   * estimada pela extrapolação e incluída na TIN, para o relevo ficar contínuo
   * em toda a área, sem degrau na borda dos pontos medidos.
   */
  constructor(readonly pontos: Cota[], cobertura: Vec2[] = [], private power = 2) {
    ;[this.a, this.b, this.c] = fitPlane(pontos)
    this.res = pontos.map((p) => ({ x: p.x, y: p.y, r: p.z - this.plane(p.x, p.y) }))
    const zs = pontos.map((p) => p.z)
    this.min = Math.min(...zs)
    this.max = Math.max(...zs)
    const extras = cobertura
      .filter(([x, y]) => pontos.every((p) => Math.hypot(p.x - x, p.y - y) > 3))
      .map(([x, y], i) => ({ id: `aux${i}`, x, y, z: this.extrapolar(x, y) }))
    this.malha = [...pontos, ...extras]
    const m = this.malha
    this.triangulos = m.length >= 3 ? new Delaunator(m.flatMap((p) => [p.x, p.y])).triangles : []
    // Caixa envolvente de cada triângulo para acelerar a busca.
    const t = this.triangulos
    this.caixas = new Float64Array((t.length / 3) * 4)
    for (let k = 0; k < t.length / 3; k++) {
      const a = m[t[3 * k]], b = m[t[3 * k + 1]], c = m[t[3 * k + 2]]
      this.caixas.set([Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y)], 4 * k)
    }
  }

  /** Interpolação linear na TIN; null se o ponto estiver fora da área coberta. */
  private tin(x: number, y: number): number | null {
    const t = this.triangulos, cx = this.caixas, eps = 1e-9
    for (let k = 0; k < t.length / 3; k++) {
      if (x < cx[4 * k] - eps || y < cx[4 * k + 1] - eps || x > cx[4 * k + 2] + eps || y > cx[4 * k + 3] + eps) continue
      const a = this.malha[t[3 * k]], b = this.malha[t[3 * k + 1]], c = this.malha[t[3 * k + 2]]
      const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
      if (Math.abs(d) < 1e-12) continue
      const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d
      const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d
      const l3 = 1 - l1 - l2
      if (l1 >= -eps && l2 >= -eps && l3 >= -eps) return l1 * a.z + l2 * b.z + l3 * c.z
    }
    return null
  }

  private plane(x: number, y: number) {
    return this.a + this.b * x + this.c * y
  }

  at(x: number, y: number): number {
    return this.tin(x, y) ?? this.extrapolar(x, y)
  }

  /** Fora da TIN: plano de tendência + resíduos por inverso da distância. */
  extrapolar(x: number, y: number): number {
    let num = 0, den = 0
    for (const p of this.res) {
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d2 < 1e-6) return this.plane(x, y) + p.r
      const w = 1 / Math.pow(d2, this.power / 2)
      num += w * p.r
      den += w
    }
    return this.plane(x, y) + num / den
  }

  /** Amostra numa grade regular. Retorna alturas linha a linha (y crescente). */
  grid(minX: number, minY: number, w: number, h: number, step: number) {
    const nx = Math.ceil(w / step) + 1
    const ny = Math.ceil(h / step) + 1
    const z = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) z[j * nx + i] = this.at(minX + i * step, minY + j * step)
    return { nx, ny, step, minX, minY, z }
  }
}

function fitPlane(p: Cota[]): [number, number, number] {
  // Resolve as equações normais 3x3 de z = a + b x + c y.
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0
  for (const { x, y, z } of p) {
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
    sz += z; sxz += x * z; syz += y * z
  }
  const M = [
    [n, sx, sy],
    [sx, sxx, sxy],
    [sy, sxy, syy],
  ]
  const v = [sz, sxz, syz]
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M)
  if (Math.abs(D) < 1e-9) return [sz / n, 0, 0]
  const col = (k: number) => M.map((row, i) => row.map((val, j) => (j === k ? v[i] : val)))
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
}

/** Curvas de nível por marching squares. Retorna segmentos por cota. */
export function contours(
  g: { nx: number; ny: number; step: number; minX: number; minY: number; z: Float64Array },
  interval: number,
): { level: number; segments: [Vec2, Vec2][] }[] {
  let lo = Infinity, hi = -Infinity
  for (const v of g.z) { if (v < lo) lo = v; if (v > hi) hi = v }
  const out: { level: number; segments: [Vec2, Vec2][] }[] = []
  const P = (i: number, j: number): Vec2 => [g.minX + i * g.step, g.minY + j * g.step]
  const Z = (i: number, j: number) => g.z[j * g.nx + i]
  for (let level = Math.ceil(lo / interval) * interval; level <= hi; level += interval) {
    const segs: [Vec2, Vec2][] = []
    for (let j = 0; j < g.ny - 1; j++) {
      for (let i = 0; i < g.nx - 1; i++) {
        const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const
        const pts: Vec2[] = []
        for (let k = 0; k < 4; k++) {
          const [ai, aj] = c[k]
          const [bi, bj] = c[(k + 1) % 4]
          const za = Z(ai, aj), zb = Z(bi, bj)
          if ((za < level) !== (zb < level)) {
            const t = (level - za) / (zb - za)
            const pa = P(ai, aj), pb = P(bi, bj)
            pts.push([pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])])
          }
        }
        if (pts.length === 2) segs.push([pts[0], pts[1]])
        else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]) }
      }
    }
    out.push({ level: Math.round(level * 1000) / 1000 || 0, segments: segs })
  }
  return out
}
