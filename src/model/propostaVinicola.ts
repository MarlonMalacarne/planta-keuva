import { areasProtegidas, terreno } from '../data/terreno'
import { contains, type Vec2 } from '../geo/polygon'
import type { Elemento, TipoElemento } from './elementos'
import type { MaterialPiso, Piso } from './pisos'
import type { Fluxo } from './fluxos'

/**
 * Proposta de layout para a vinícola: pavilhão de 1.800 m², 50 tanques de Ø 4,5 m, 100 de
 * Ø 2,5 m, portão, balanças, guarita, asfalto e o caminho das carretas.
 *
 * - Pavilhão (60 × 30 m) na parte plana do sul, de frente para a estrada de terra, com o pátio
 *   das carretas atrás (lado norte): recebimento de uva e docas ficam fora da vista da estrada.
 * - Portão na estrada de terra, a ~75 m da rodovia (a carreta sai da rodovia e espera fora dela).
 *   Logo depois, guarita e duas balanças (entrada e saída), para ninguém esperar na safra.
 * - Tanques pequenos a leste do portão; tanques grandes na faixa do pedido de corte, ao longo da
 *   rodovia, com uma via de mão dupla e um retorno no fim (cabe uma carreta de 18,6 m).
 * - Rotatória atrás do pavilhão: quem só descarrega uva dá a volta nela; a carreta-tanque segue
 *   para os tanques grandes, retorna e sai pela mesma rotatória.
 * - Nada entra na reserva legal, na compensação, no recuo de 5 m nem na mata fora do corte.
 */
export interface Proposta {
  elementos: Omit<Elemento, 'id'>[]
  pisos: Omit<Piso, 'id'>[]
  fluxos: Omit<Fluxo, 'id'>[]
}

type P = Vec2
const r2 = (v: number) => Math.round(v * 100) / 100
const pt = ([x, y]: P): P => [r2(x), r2(y)]

// Eixos da frente do lote: u ao longo da estrada de terra (F → E), v para dentro (norte).
const E = terreno.vertices.E
const ROT_FRENTE = (Math.atan2(E[1], E[0]) * 180) / Math.PI
const du: P = [Math.cos((ROT_FRENTE * Math.PI) / 180), Math.sin((ROT_FRENTE * Math.PI) / 180)]
const dv: P = [-du[1], du[0]]
/** Ponto a `u` metros de F ao longo da frente e `v` metros para dentro do lote. */
const F = (u: number, v: number): P => [u * du[0] + v * dv[0], u * du[1] + v * dv[1]]
const vDe = ([x, y]: P) => x * dv[0] + y * dv[1]
const retF = (u0: number, v0: number, u1: number, v1: number): P[] => [F(u0, v0), F(u1, v0), F(u1, v1), F(u0, v1)]

/** Mata da foto que fica (fora do pedido de corte e das áreas protegidas). */
const naMataQueFica = (p: P) => contains(terreno.mata.poligono, p) && !contains(terreno.supressao.poligono, p)

/** Dá para pôr obra neste ponto: dentro do lote e fora do recuo, das protegidas e da mata que fica. */
function livre(p: P) {
  if (!contains(terreno.perimetro, p) || contains(terreno.recuo.poligono, p)) return false
  if (areasProtegidas.some((a) => contains(a.poligono, p))) return false
  return !naMataQueFica(p)
}
/** O círculo de raio r em volta de p está todo livre. */
function livreEmVolta(p: P, r: number) {
  if (!livre(p)) return false
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    if (!livre([p[0] + r * Math.cos(a), p[1] + r * Math.sin(a)])) return false
  }
  return true
}

// Borda leste da faixa do corte: a compensação (quase em pé) até V07 e depois a diagonal V07–V08.
const COMP_SO = terreno.compensacao.poligono[0], COMP_NO = terreno.compensacao.poligono[3]
const V07 = terreno.supressao.poligono[6], V08 = terreno.supressao.poligono[7]
const xComp = (y: number) => COMP_SO[0] + ((COMP_NO[0] - COMP_SO[0]) * (y - COMP_SO[1])) / (COMP_NO[1] - COMP_SO[1])
const diag = (() => {
  const dx = V08[0] - V07[0], dy = V08[1] - V07[1], n = Math.hypot(dx, dy)
  return { d: [dx / n, dy / n] as P, n: [-dy / n, dx / n] as P } // n aponta para oeste (para dentro da faixa)
})()
/** Distância de p até a borda leste da faixa (positiva para dentro). */
function dLeste([x, y]: P) {
  if (y < V07[1]) return xComp(y) - x
  return (x - V07[0]) * diag.n[0] + (y - V07[1]) * diag.n[1]
}
/** Ponto a `d` metros da borda leste da faixa, na altura `y` da borda. */
function ladoLeste(y: number, d: number): P {
  if (y < V07[1]) return [xComp(y) - d, y]
  const t = (y - V07[1]) / diag.d[1]
  return [V07[0] + diag.d[0] * t + diag.n[0] * d, V07[1] + diag.d[1] * t + diag.n[1] * d]
}

const arco = (c: P, r: number, a0: number, a1: number, passo = 15): P[] => {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / passo))
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as P
  })
}
const circulo = (c: P, r: number, n = 24) => arco(c, r, 0, 360 - 360 / n, 360 / n)

/** Grade girada `rot` graus: centros que passam no teste. */
function grade(origem: P, rot: number, passo: number, ni: number, nj: number, ok: (p: P) => boolean) {
  const a = (rot * Math.PI) / 180
  const ex: P = [Math.cos(a), Math.sin(a)], ey: P = [-Math.sin(a), Math.cos(a)]
  const out: P[] = []
  for (let i = -ni; i <= ni; i++)
    for (let j = -nj; j <= nj; j++) {
      const p: P = [origem[0] + (i * ex[0] + j * ey[0]) * passo, origem[1] + (i * ex[1] + j * ey[1]) * passo]
      if (ok(p)) out.push(p)
    }
  return out
}

/** Contorno em degraus em volta de tanques numa grade girada `rot` (uma coluna por degrau). */
function escada(centros: P[], rot: number, passo: number, folga: number): P[] {
  const a = (rot * Math.PI) / 180
  const ex: P = [Math.cos(a), Math.sin(a)], ey: P = [-Math.sin(a), Math.cos(a)]
  const colunas = new Map<number, [number, number]>()
  for (const c of centros) {
    const s = Math.round((c[0] * ex[0] + c[1] * ex[1]) * 10) / 10
    const q = c[0] * ey[0] + c[1] * ey[1]
    const atual = colunas.get(s) ?? [Infinity, -Infinity]
    colunas.set(s, [Math.min(atual[0], q), Math.max(atual[1], q)])
  }
  const ss = [...colunas.keys()].sort((x, y) => x - y)
  const meio = passo / 2
  const baixo: P[] = [], alto: P[] = []
  ss.forEach((s, i) => {
    const [q0, q1] = colunas.get(s)!
    const esq = i === 0 ? s - folga : s - meio, dir = i === ss.length - 1 ? s + folga : s + meio
    baixo.push([esq, q0 - folga], [dir, q0 - folga])
    alto.push([esq, q1 + folga], [dir, q1 + folga])
  })
  return [...baixo, ...alto.reverse()].map(([s, q]) => [s * ex[0] + q * ey[0], s * ex[1] + q * ey[1]] as P)
}

/** Linha do recuo deslocada `d` metros para dentro do lote (do norte para o sul). */
function recuoParaDentro(d: number): P[] {
  const l = terreno.recuo.linha
  const desl = (lado: number) =>
    l.map((p, i) => {
      const a = l[Math.max(0, i - 1)], b = l[Math.min(l.length - 1, i + 1)]
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
      return [p[0] + (lado * d * dy) / n, p[1] - (lado * d * dx) / n] as P
    })
  const um = desl(1)
  const meio = Math.floor(l.length / 2)
  return contains(terreno.perimetro, um[meio]) && !contains(terreno.recuo.poligono, um[meio]) ? um : desl(-1)
}

// Medidas principais (metros)
const TG = { diametro: 4.5, altura: 9, passo: 5.5 } // tanque grande, 1 m entre um e outro
const TP = { diametro: 2.5, altura: 5, passo: 3.3 } // tanque pequeno, 0,8 m entre um e outro
const ROT_FAIXA = 18 // giro da grade dos tanques grandes (acompanha a rodovia)
const ROTATORIA: P = [4, 57]
const RETORNO_N: P = [-17.4, 128]
const R_RETORNO = 14 // raio externo: carreta de 18,6 m gira com folga

let cache: Proposta | null = null

export function propostaVinicola(): Proposta {
  if (cache) return structuredClone(cache)
  const elementos: Omit<Elemento, 'id'>[] = []
  const el = (tipo: TipoElemento, nome: string, c: P, largura: number, comprimento: number, altura: number, rot: number, cor: string) =>
    elementos.push({ tipo, nome, x: r2(c[0]), y: r2(c[1]), rot: r2(((rot % 360) + 360) % 360), largura, comprimento, altura, cor })

  // Pavilhão, portão, guarita, balanças e cerca da frente
  el('galpao', 'Pavilhão', F(42, 21), 60, 30, 11, ROT_FRENTE, '#c9ced6')
  el('portao', 'Portão', F(80, 0.4), 0.3, 15, 2.2, ROT_FRENTE - 90, '#4a5563')
  el('predio', 'Guarita', F(80, 5.5), 3, 5, 3, ROT_FRENTE, '#e8e2d6')
  el('caixa', 'Balança de entrada', F(84.5, 24), 3.2, 21, 0.35, ROT_FRENTE, '#5c6b7a')
  el('caixa', 'Balança de saída', F(75.75, 24), 3.2, 21, 0.35, ROT_FRENTE, '#5c6b7a')
  el('muro', 'Cerca da frente 1', F(39.25, 0.3), 0.25, 65.5, 2, ROT_FRENTE - 90, '#8a8f98')
  el('muro', 'Cerca da frente 2', F(103, 0.3), 0.25, 30, 2, ROT_FRENTE - 90, '#8a8f98')

  // 100 tanques pequenos a leste do portão (grade alinhada com a frente)
  const pequenos: P[] = []
  for (let k = 0; k < 15; k++)
    for (let j = 0; j < 20; j++) {
      const p = F(88 + TP.diametro / 2 + k * TP.passo, 6 + TP.diametro / 2 + j * TP.passo)
      if (livreEmVolta(p, TP.diametro / 2 + 1)) pequenos.push(p)
    }
  pequenos.slice(0, 100).forEach((p, i) => el('tanque', `Tanque pequeno ${i + 1}`, p, TP.diametro, TP.diametro, TP.altura, ROT_FRENTE, '#cfd6de'))

  // 50 tanques grandes na faixa do corte, entre o recuo e a via (7,5 m) junto da compensação
  const r = TG.diametro / 2
  const grandes = grade([-6.75, 101.5], ROT_FAIXA, TG.passo, 12, 20, (p) =>
    p[1] > 60 && p[0] < 25 &&
    Math.hypot(p[0] - ROTATORIA[0], p[1] - ROTATORIA[1]) > 14 + 1.5 + r &&
    Math.hypot(p[0] - RETORNO_N[0], p[1] - RETORNO_N[1]) > R_RETORNO + 1 + r &&
    dLeste(p) > r + 7.5 + 2 &&
    livreEmVolta(p, r + 1.5),
  )
    .sort((a, b) => a[1] - b[1])
    .slice(0, 50)
  grandes.forEach((p, i) => el('tanque', `Tanque grande ${i + 1}`, p, TG.diametro, TG.diametro, TG.altura, ROT_FAIXA, '#b7c3cf'))

  // Pisos (os de cima vêm depois)
  const pisos: Omit<Piso, 'id'>[] = []
  const piso = (nome: string, material: MaterialPiso, pontos: P[]) => pisos.push({ nome, material, pontos: pontos.map(pt) })
  const arcoNorte = arco(RETORNO_N, R_RETORNO + 0.5, 20, 175, 11)
  const recuo = recuoParaDentro(1).filter((p) => p[1] < arcoNorte[arcoNorte.length - 1][1] && vDe(p) >= 36)
  piso('Pátio e vias das carretas', 'asfalto', [
    F(72.5, 0.4), F(87.5, 0.4), F(87.5, 46.8), F(82.9, 48.7), F(78, 50), F(33, 50),
    [COMP_SO[0] - 1, COMP_SO[1] - 1.4], ladoLeste(V07[1] - 0.25, 1), ladoLeste(arcoNorte[0][1] - 2, 1),
    ...arcoNorte, ...recuo, F(3.2, 36), F(72.5, 36),
  ])
  const base = (nome: string, centros: P[], rot: number, passo: number, folga: number) => centros.length && piso(nome, 'concreto', escada(centros, rot, passo, folga))
  base('Tanques grandes', grandes.filter((p) => p[1] < RETORNO_N[1]), ROT_FAIXA, TG.passo, r + 0.5)
  base('Tanques grandes do retorno', grandes.filter((p) => p[1] >= RETORNO_N[1]), ROT_FAIXA, TG.passo, r + 0.5)
  base('Tanques pequenos', pequenos.slice(0, 100), ROT_FRENTE, TP.passo, TP.diametro / 2 + 0.5)
  piso('Carga de vinho a granel', 'concreto', [ladoLeste(96, 4.6), ladoLeste(112, 4.6), ladoLeste(112, 8.2), ladoLeste(96, 8.2)])
  piso('Recebimento de uva', 'concreto', retF(13, 36, 31, 40))
  piso('Docas de expedição', 'concreto', retF(46, 36, 70, 40))
  piso('Rotatória', 'grama', circulo(ROTATORIA, 5))
  piso('Retorno', 'grama', circulo(RETORNO_N, 5))
  piso('Estacionamento', 'bloquete', retF(12, 0.6, 72.5, 6))
  piso('Acesso de serviço', 'cascalho', [F(6, 0.6), F(12, 0.6), F(12, 36), F(3.2, 36)])
  piso('Jardim da frente', 'grama', [F(88, 0.6), F(118.2, 0.6), F(118.8, 4.6), F(88, 4.6)])

  // Caminho das carretas. `d` afasta um pouco os dois caminhos onde eles andam juntos.
  const entrada = (d: number): P[] => [F(20, -6.5 + d), F(66, -6.5 + d), F(78, -4.5 + d), F(83.5 + d, 1), F(84.5 + d, 8), F(84.5 + d, 34), F(83 + d, 41), F(78.5, 46 + d), F(72, 47.3 + d), F(30, 47.3 + d)]
  const saida = (d: number): P[] => [F(20, 42.6 + d), F(70, 42.6 + d), F(74 + d, 40.5), F(75.75 + d, 35), F(75.75 + d, 8), F(74.5 + d, 1), F(70, -2.6 + d), F(60, -3.3 + d), F(20, -3.3 + d)]
  const giro = (c: P, r: number, a0: number, a1: number) => arco(c, r, a0 + ROT_FRENTE, a1 + ROT_FRENTE)
  const uva = -0.6, granel = 0.6
  const fluxos: Omit<Fluxo, 'id'>[] = [
    {
      nome: 'Carretas de uva',
      cor: '#a855f7',
      pontos: [...entrada(uva), ...giro(ROTATORIA, 9.5 + uva, -30, 255), ...saida(uva)].map(pt),
    },
    {
      nome: 'Carretas-tanque (vinho a granel)',
      cor: '#f59f0a',
      pontos: [
        ...entrada(granel),
        ...giro(ROTATORIA, 9.5 + granel, -30, 45),
        ...[70, 80, V07[1], 100, 110, 118].map((y) => ladoLeste(y, 3.2)),
        ...arco(RETORNO_N, 9.5, -25, 310),
        ...[118, 110, 100, V07[1], 80, 72].map((y) => ladoLeste(y, 6.3)),
        ...giro(ROTATORIA, 9.5 + granel, 85, 255),
        ...saida(granel),
      ].map(pt),
    },
  ]

  cache = { elementos, pisos, fluxos }
  return structuredClone(cache)
}
