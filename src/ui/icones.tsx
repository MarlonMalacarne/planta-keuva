import { Box, BrickWall, Building2, Cylinder, Fence, Warehouse, type LucideIcon } from 'lucide-react'
import type { TipoElemento } from '../model/elementos'

export const iconeElemento: Record<TipoElemento, LucideIcon> = {
  galpao: Warehouse,
  predio: Building2,
  tanque: Cylinder,
  muro: BrickWall,
  portao: Fence,
  caixa: Box,
}
