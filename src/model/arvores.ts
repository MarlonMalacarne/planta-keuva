import { areasProtegidas } from '../data/terreno'
import { contains, rng, scatter } from '../geo/polygon'

/** Árvore do terreno, editável como qualquer objeto. Medidas em metros. */
export interface Arvore {
  id: string
  x: number
  y: number
  altura: number
  /** Diâmetro da copa. */
  copa: number
}

const r2 = (v: number) => Math.round(v * 100) / 100
const r1 = (v: number) => Math.round(v * 10) / 10

/** Árvores da reserva legal e da compensação ambiental (sempre as mesmas). */
export function arvoresProtegidas(): Arvore[] {
  const r = rng(7)
  return areasProtegidas
    .flatMap((a, k) => scatter(a.poligono, 5.5, 42 + k))
    .map(([x, y], i) => ({
      id: `T${i + 1}`,
      x: r2(x),
      y: r2(y),
      altura: r1(7 + r() * 9),
      copa: r1(2 * (2.2 + r() * 2.4)),
    }))
}

/** A árvore fica numa área protegida (reserva legal ou compensação). */
export const protegida = (a: Pick<Arvore, 'x' | 'y'>) => areasProtegidas.some((p) => contains(p.poligono, [a.x, a.y]))

/** Variação visual estável por árvore (giro, achatamento e tom da copa), tirada do id. */
export function variacao(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const r = rng(h >>> 0)
  return { giro: r() * Math.PI * 2, achatamento: 0.75 + r() * 0.35, tronco: 0.25 + r() * 0.15, h: 0.26 + r() * 0.08, s: 0.35 + r() * 0.25, l: 0.2 + r() * 0.14 }
}

export function proximoIdArvore(arvores: Arvore[]) {
  let n = arvores.length + 1
  const ids = new Set(arvores.map((a) => a.id))
  while (ids.has(`T${n}`)) n++
  return `T${n}`
}
