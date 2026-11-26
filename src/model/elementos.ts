import { contains as dentro, sobrepoe } from '../geo/polygon'

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

/** Face lateral do elemento: x± puxa a largura, y± puxa o comprimento (eixos do próprio elemento). */
export type Lado = 'x+' | 'x-' | 'y+' | 'y-'

const arredondar = (v: number, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas
const noPasso = (v: number, passo: number) => (passo > 0 ? Math.round(v / passo) * passo : v)

/** Direção, em planta, para onde a face `lado` aponta. */
export function direcaoLado(e: Pick<Elemento, 'rot'>, lado: Lado): P {
  const a = (e.rot * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  const d: P = lado[0] === 'x' ? [c, s] : [-s, c]
  return lado[1] === '+' ? d : [-d[0], -d[1]]
}

export function medidaMinima(e: Elemento, eixo: 'largura' | 'comprimento' | 'altura') {
  if (eixo === 'altura') return 0.3
  return e.tipo === 'muro' && eixo === 'largura' ? 0.05 : 0.5
}

/**
 * Puxa a face `lado` por `d` metros a partir do elemento `e` (como estava no início do arrasto).
 * A face oposta fica parada; no tanque o diâmetro cresce em volta do centro.
 */
export function esticar(e: Elemento, lado: Lado, d: number, passo = 0.5): Partial<Elemento> {
  if (e.tipo === 'tanque') {
    const diam = arredondar(Math.max(medidaMinima(e, 'largura'), noPasso(e.largura + 2 * d, passo)))
    return { largura: diam, comprimento: diam }
  }
  const eixo = lado[0] === 'x' ? 'largura' : 'comprimento'
  const novo = arredondar(Math.max(medidaMinima(e, eixo), noPasso(e[eixo] + d, passo)))
  const delta = novo - e[eixo]
  const [dx, dy] = direcaoLado(e, lado)
  return { [eixo]: novo, x: arredondar(e.x + (dx * delta) / 2), y: arredondar(e.y + (dy * delta) / 2) }
}

export function esticarAltura(e: Elemento, d: number, passo = 0.5): Partial<Elemento> {
  return { altura: arredondar(Math.max(medidaMinima(e, 'altura'), noPasso(e.altura + d, passo))) }
}

/** Gira o elemento pelo ângulo (graus) varrido pelo mouse, em passos de `passo` graus. */
export function girar(e: Elemento, varrido: number, passo = 5): Partial<Elemento> {
  const rot = noPasso(e.rot + varrido, passo)
  return { rot: arredondar(((rot % 360) + 360) % 360, 2) }
}

/** Ângulo em graus, sentido anti-horário, do ponto p visto do centro do elemento. */
export function anguloEm(e: Pick<Elemento, 'x' | 'y'>, [x, y]: P) {
  return (Math.atan2(y - e.y, x - e.x) * 180) / Math.PI
}

/** Diferença entre dois ângulos, entre -180 e 180. */
export function difAngulo(a: number, b: number) {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/**
 * Procura um lugar livre para um elemento novo: dentro do lote, sem tocar nas áreas proibidas
 * (recuo, reserva, compensação), sem encostar nos elementos já colocados (folga de 3 m) nem
 * ficar em cima de árvores, o mais perto possível de `perto`.
 */
export function lugarLivre(
  largura: number,
  comprimento: number,
  existentes: Elemento[],
  areas: { lote: P[]; proibidas: P[][]; arvores?: { x: number; y: number }[] },
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
    if (caixas.some(([a, b, c, d]) => x + w > a && x - w < c && y + l > b && y - l < d)) continue
    // Não coloca obra em cima de árvore (1 m de folga para a copa).
    if (areas.arvores?.some((t) => Math.abs(t.x - x) < w + 1 && Math.abs(t.y - y) < l + 1)) continue
    const caixa = pts.slice(0, 4)
    if (areas.proibidas.some((a) => sobrepoe(caixa, a))) continue
    return [x, y]
  }
  return null
}
