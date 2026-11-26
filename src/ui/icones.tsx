import { Box, BrickWall, Building2, Cylinder, Warehouse, type LucideIcon } from 'lucide-react'
import type { TipoElemento } from '../model/elementos'

export const iconeElemento: Record<TipoElemento, LucideIcon> = {
  galpao: Warehouse,
  predio: Building2,
  tanque: Cylinder,
  muro: BrickWall,
  caixa: Box,
}
