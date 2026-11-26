import { areasProtegidas, terreno, type AreaProtegida } from '../data/terreno'
import { contains, sobrepoe, type Vec2 } from '../geo/polygon'
import { contorno, type Elemento } from './elementos'

/** Contorno real no chão: o tanque é redondo, o resto é retângulo. */
export function pegada(e: Elemento): Vec2[] {
  if (e.tipo !== 'tanque') return contorno(e)
  const r = e.largura / 2
  return Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    return [e.x + r * Math.cos(a), e.y + r * Math.sin(a)] as Vec2
  })
}

/** Área protegida que o elemento invade, se invadir alguma. */
export function areaInvadida(e: Elemento): AreaProtegida | undefined {
  const p = pegada(e)
  return areasProtegidas.find((a) => sobrepoe(p, a.poligono))
}

/** Área protegida onde fica o ponto (uma árvore, por exemplo). */
export function areaDoPonto(p: Vec2): AreaProtegida | undefined {
  return areasProtegidas.find((a) => contains(a.poligono, p))
}

/** Lote e partes onde não se coloca obra nova: recuo, reserva legal e compensação. */
export const areasDeObra = {
  lote: terreno.perimetro,
  proibidas: [terreno.recuo.poligono, ...areasProtegidas.map((a) => a.poligono)],
}
