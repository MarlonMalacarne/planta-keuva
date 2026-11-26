import { length, type Vec2 } from '../geo/polygon'

/** Caminho com setas no chão: por onde andam as carretas, por exemplo. */
export interface Fluxo {
  id: string
  nome: string
  cor: string
  /** Pontos do caminho, na ordem em que se anda (X leste, Y norte), em metros. */
  pontos: Vec2[]
}

export const coresFluxo = ['#e5484d', '#f59f0a', '#3e9bff', '#30a46c', '#a855f7', '#ffffff']

export const comprimentoFluxo = (f: Pick<Fluxo, 'pontos'>) => length(f.pontos, false)

/**
 * Onde desenhar as setas: a cada `espaco` metros ao longo do caminho (a primeira em `inicio`,
 * por padrão na metade do espaço) e uma no fim. Cada seta tem posição e direção (ângulo em
 * radianos, anti-horário).
 */
export function setasDoFluxo(pts: Vec2[], espaco: number, inicio = espaco / 2): { p: Vec2; ang: number }[] {
  const out: { p: Vec2; ang: number }[] = []
  if (pts.length < 2 || espaco <= 0) return out
  let proxima = inicio
  let andado = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const l = Math.hypot(bx - ax, by - ay)
    if (l === 0) continue
    const ang = Math.atan2(by - ay, bx - ax)
    while (proxima <= andado + l) {
      const t = (proxima - andado) / l
      out.push({ p: [ax + (bx - ax) * t, ay + (by - ay) * t], ang })
      proxima += espaco
    }
    andado += l
  }
  const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1]
  const fim = { p: pts[pts.length - 1], ang: Math.atan2(by - ay, bx - ax) }
  // A do fim substitui uma que tenha caído colada nela.
  if (out.length && Math.hypot(out[out.length - 1].p[0] - bx, out[out.length - 1].p[1] - by) < espaco / 3) out.pop()
  out.push(fim)
  return out
}
