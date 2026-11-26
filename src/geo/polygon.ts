/** Ponto 2D em metros. X = leste, Y = norte. */
export type Vec2 = [number, number]

export function area(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function length(path: Vec2[], closed = false): number {
  let s = 0
  const n = closed ? path.length : path.length - 1
  for (let i = 0; i < n; i++) s += dist(path[i], path[(i + 1) % path.length])
  return s
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function contains(poly: Vec2[], [x, y]: Vec2): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function bbox(points: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function centroid(poly: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  a /= 2
  return [cx / (6 * a), cy / (6 * a)]
}

/** Gerador pseudoaleatório determinístico (mesma semente = mesmo resultado). */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Espalha pontos dentro de um polígono com espaçamento mínimo aproximado (para árvores). */
export function scatter(poly: Vec2[], spacing: number, seed = 1): Vec2[] {
  const r = rng(seed)
  const b = bbox(poly)
  const out: Vec2[] = []
  for (let y = b.minY; y < b.maxY; y += spacing) {
    for (let x = b.minX; x < b.maxX; x += spacing) {
      const p: Vec2 = [x + (r() - 0.5) * spacing * 0.9, y + (r() - 0.5) * spacing * 0.9]
      if (contains(poly, p)) out.push(p)
    }
  }
  return out
}

const orient = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Os segmentos ab e cd se cruzam (sem contar quando só encostam). */
function cruzam(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0
}

/** Os dois polígonos têm alguma parte em comum (um dentro do outro também conta). */
export function sobrepoe(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) if (cruzam(p, q, b[j], b[(j + 1) % b.length])) return true
  }
  return a.some((p) => contains(b, p)) || b.some((p) => contains(a, p))
}
