import raw from './terreno.json'
import { area, bbox, length, type Vec2 } from '../geo/polygon'
import { ElevationModel, type Cota } from '../geo/elevation'

export interface Lado { de: string; para: string; m: number; curva?: boolean }

export interface Terreno {
  nome: string
  fonte: string
  areaOficialM2: number
  vertices: Record<string, Vec2>
  lados: Lado[]
  perimetro: Vec2[]
  divisaRodovia: Vec2[]
  recuo: { larguraM: number; poligono: Vec2[]; linha: Vec2[] }
  /** Mancha de mata vista na foto (aproximada). As árvores que ficam são só as das áreas protegidas. */
  mata: { aproximada: boolean; poligono: Vec2[] }
  laudo: string
  reservaLegal: { areaM2: number; poligono: Vec2[] }
  compensacao: { areaM2: number; poligono: Vec2[] }
  /** Onde o laudo autoriza tirar os ligustros (exóticas). */
  supressao: { areaM2: number; poligono: Vec2[] }
  cotas: Cota[]
  fotoAerea: { arquivo: string; xMin: number; yMax: number; largura: number; altura: number }
}

export const terreno = raw as unknown as Terreno

export interface AreaProtegida {
  id: 'reserva' | 'compensacao'
  nome: string
  curto: string
  areaM2: number
  poligono: Vec2[]
}

/** Reserva legal e compensação ambiental do laudo agronômico: não se constrói nelas. */
export const areasProtegidas: AreaProtegida[] = [
  { id: 'reserva', nome: 'Reserva legal', curto: 'Reserva legal', ...terreno.reservaLegal },
  { id: 'compensacao', nome: 'Área de compensação ambiental', curto: 'Compensação', ...terreno.compensacao },
]

/** Relevo só com as cotas lidas da foto (o app usa as cotas editáveis do projeto). */
export const elevacaoDaFoto = new ElevationModel(terreno.cotas)

/** Extensão total do modelo (lote + entorno da foto aérea). */
export const extensao = (() => {
  const f = terreno.fotoAerea
  return { minX: f.xMin, minY: f.yMax - f.altura, maxX: f.xMin + f.largura, maxY: f.yMax }
})()

export function calcularResumo(elevacao: ElevationModel) {
  const total = area(terreno.perimetro)
  const recuo = area(terreno.recuo.poligono)
  const reserva = area(terreno.reservaLegal.poligono)
  const compensacao = area(terreno.compensacao.poligono)
  const b = bbox(terreno.perimetro)
  let zMin = Infinity, zMax = -Infinity
  for (const p of terreno.perimetro) {
    const z = elevacao.at(p[0], p[1])
    zMin = Math.min(zMin, z)
    zMax = Math.max(zMax, z)
  }
  return {
    areaTotal: total,
    areaRecuo: recuo,
    areaReserva: reserva,
    areaCompensacao: compensacao,
    // O recuo fica do lado da rodovia e as áreas protegidas a leste: não se sobrepõem.
    areaLivre: total - recuo - reserva - compensacao,
    perimetro: length(terreno.perimetro, true),
    largura: b.width,
    profundidade: b.height,
    zMin,
    zMax,
  }
}

export const fmt = {
  m: (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' m',
  m2: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' m²',
  ha: (v: number) => (v / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' ha',
  z: (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m',
}
