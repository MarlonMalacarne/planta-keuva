import { area, length, type Vec2 } from '../geo/polygon'

/** Acabamento do chão que o usuário "pinta" no terreno. */
export type MaterialPiso = 'asfalto' | 'cascalho' | 'concreto' | 'bloquete' | 'grama' | 'terra'

export interface Piso {
  id: string
  nome: string
  material: MaterialPiso
  /** Contorno no chão (X leste, Y norte), em metros. */
  pontos: Vec2[]
}

export const materiais: Record<MaterialPiso, { nome: string; cor: string; descricao: string }> = {
  asfalto: { nome: 'Asfalto', cor: '#3b3e44', descricao: 'Vias e estacionamento' },
  cascalho: { nome: 'Cascalho', cor: '#a79d8b', descricao: 'Brita ou saibro' },
  concreto: { nome: 'Concreto', cor: '#c6c3bb', descricao: 'Pátio e calçadas' },
  bloquete: { nome: 'Bloquete', cor: '#9b958b', descricao: 'Paver intertravado' },
  grama: { nome: 'Grama', cor: '#5e9a47', descricao: 'Jardim e taludes' },
  terra: { nome: 'Terra', cor: '#8b6a49', descricao: 'Chão batido' },
}

export const ordemMateriais = Object.keys(materiais) as MaterialPiso[]

export const areaPiso = (p: Pick<Piso, 'pontos'>) => area(p.pontos)
export const perimetroPiso = (p: Pick<Piso, 'pontos'>) => length(p.pontos, true)

/** O nome ainda é o automático ("Asfalto 2")? Então acompanha a troca de material. */
export const nomeAutomatico = (nome: string) => ordemMateriais.some((m) => new RegExp(`^${materiais[m].nome} \\d+$`).test(nome))

/** Retângulo com cantos opostos a e b. */
export const retangulo = ([x0, y0]: Vec2, [x1, y1]: Vec2): Vec2[] => [
  [Math.min(x0, x1), Math.min(y0, y1)],
  [Math.max(x0, x1), Math.min(y0, y1)],
  [Math.max(x0, x1), Math.max(y0, y1)],
  [Math.min(x0, x1), Math.max(y0, y1)],
]
