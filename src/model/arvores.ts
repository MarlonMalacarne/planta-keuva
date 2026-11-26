import { areasProtegidas, terreno } from '../data/terreno'
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

type Ponto = Pick<Arvore, 'x' | 'y'>

/** A árvore fica numa área protegida (reserva legal ou compensação). */
export const protegida = (a: Ponto) => areasProtegidas.some((p) => contains(p.poligono, [a.x, a.y]))

/** Fica na área do pedido de corte (supressão dos ligustros), fora das áreas protegidas. */
export const naAreaDeCorte = (a: Ponto) => contains(terreno.supressao.poligono, [a.x, a.y]) && !protegida(a)

/** Mata da foto que não é reserva nem compensação e não entrou no pedido de corte: continua. */
export const naMataMantida = (a: Ponto) => contains(terreno.mata.poligono, [a.x, a.y]) && !protegida(a) && !naAreaDeCorte(a)

/** Árvores da mata fora do pedido de corte, sem encostar (4 m) nas `existentes`. */
export function arvoresDaMataMantida(existentes: Arvore[]): Arvore[] {
  const r = rng(11)
  const todas = [...existentes]
  const novas: Arvore[] = []
  for (const [x, y] of scatter(terreno.mata.poligono, 5.5, 44)) {
    const altura = r1(7 + r() * 9), copa = r1(2 * (2.2 + r() * 2.4))
    if (!naMataMantida({ x, y }) || todas.some((t) => Math.hypot(t.x - x, t.y - y) < 4)) continue
    const a = { id: proximoIdArvore(todas), x: r2(x), y: r2(y), altura, copa }
    novas.push(a)
    todas.push(a)
  }
  return novas
}

/** Árvores que ficam no terreno: as protegidas e as da mata fora do pedido de corte. */
export function arvoresIniciais(): Arvore[] {
  const p = arvoresProtegidas()
  return [...p, ...arvoresDaMataMantida(p)]
}

/** Em que parte do terreno a árvore está, para mostrar no painel. */
export function situacaoArvore(a: Ponto) {
  const area = areasProtegidas.find((p) => contains(p.poligono, [a.x, a.y]))
  if (area) return area.nome
  if (naAreaDeCorte(a)) return 'Na área de supressão autorizada'
  if (naMataMantida(a)) return 'Mata fora do pedido de corte'
  return 'Fora da mata'
}

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
