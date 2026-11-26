/** Elementos que o usuário coloca no terreno. Medidas em metros, rotação em graus. */
export type TipoElemento = 'galpao' | 'predio' | 'tanque' | 'muro' | 'caixa'

export interface Elemento {
  id: string
  tipo: TipoElemento
  nome: string
  /** Centro em planta (X leste, Y norte). */
  x: number
  y: number
  /** Rotação em graus, sentido anti-horário visto de cima (0 = largura no eixo leste-oeste). */
  rot: number
  /** Dimensão no eixo X local. No tanque é o diâmetro; no muro é a espessura. */
  largura: number
  /** Dimensão no eixo Y local. */
  comprimento: number
  altura: number
  cor: string
}

export interface Modelo {
  nome: string
  descricao: string
  largura: number
  comprimento: number
  altura: number
  cor: string
}

export const catalogo: Record<TipoElemento, Modelo> = {
  galpao: { nome: 'Galpão', descricao: 'Estrutura com telhado de duas águas', largura: 30, comprimento: 50, altura: 10, cor: '#c9ced6' },
  predio: { nome: 'Prédio', descricao: 'Escritório, refeitório, vestiário', largura: 15, comprimento: 25, altura: 7, cor: '#e8e2d6' },
  tanque: { nome: 'Tanque / silo', descricao: 'Reservatório cilíndrico', largura: 8, comprimento: 8, altura: 12, cor: '#9fb3c8' },
  muro: { nome: 'Muro', descricao: 'Muro ou cerca de divisa', largura: 0.25, comprimento: 40, altura: 2.5, cor: '#b8a99a' },
  caixa: { nome: 'Bloco', descricao: 'Volume genérico (equipamento, área)', largura: 6, comprimento: 6, altura: 3, cor: '#7aa2d6' },
}

export const coresSugeridas = ['#c9ced6', '#e8e2d6', '#9fb3c8', '#b8a99a', '#7aa2d6', '#5c6b7a', '#d97757', '#4f9d69']

export function areaProjecao(e: Elemento) {
  return e.tipo === 'tanque' ? Math.PI * (e.largura / 2) ** 2 : e.largura * e.comprimento
}

export function volume(e: Elemento) {
  return areaProjecao(e) * e.altura
}

/** Cantos do retângulo em planta, já rotacionado. */
export function contorno(e: Elemento): [number, number][] {
  const a = (e.rot * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  const w = e.largura / 2, l = e.comprimento / 2
  return [[-w, -l], [w, -l], [w, l], [-w, l]].map(([u, v]) => [e.x + u * c - v * s, e.y + u * s + v * c])
}

type P = [number, number]
const dentro = (poly: P[], [x, y]: P) => {
  let d = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

/**
 * Procura um lugar livre para um elemento novo: dentro do lote, fora do recuo e da mata,
 * sem encostar nos elementos já colocados (folga de 3 m), o mais perto possível de `perto`.
 */
export function lugarLivre(
  largura: number,
  comprimento: number,
  existentes: Elemento[],
  areas: { lote: P[]; proibidas: P[][] },
  perto: P,
): P | null {
  const folga = 3
  const caixas = existentes.map((e) => {
    const c = contorno(e)
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1])
    return [Math.min(...xs) - folga, Math.min(...ys) - folga, Math.max(...xs) + folga, Math.max(...ys) + folga]
  })
  const candidatos: P[] = []
  for (let dx = -120; dx <= 120; dx += 2) for (let dy = -120; dy <= 120; dy += 2) candidatos.push([perto[0] + dx, perto[1] + dy])
  candidatos.sort((a, b) => Math.hypot(a[0] - perto[0], a[1] - perto[1]) - Math.hypot(b[0] - perto[0], b[1] - perto[1]))
  const w = largura / 2, l = comprimento / 2
  for (const [x, y] of candidatos) {
    const pts: P[] = [[x - w, y - l], [x + w, y - l], [x + w, y + l], [x - w, y + l], [x, y - l], [x, y + l], [x - w, y], [x + w, y], [x, y]]
    if (!pts.every((p) => dentro(areas.lote, p))) continue
    if (pts.some((p) => areas.proibidas.some((a) => dentro(a, p)))) continue
    if (caixas.some(([a, b, c, d]) => x + w > a && x - w < c && y + l > b && y - l < d)) continue
    return [x, y]
  }
  return null
}
