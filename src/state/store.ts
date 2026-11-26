import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Vec2 } from '../geo/polygon'
import type { MaterialPiso } from '../model/pisos'

export type Vista = '2d' | '3d'
export type Ferramenta = 'selecionar' | 'cota' | 'piso'

export interface Camadas {
  foto: boolean
  divisas: boolean
  recuo: boolean
  mata: boolean
  relevo: boolean
}

export const nomesCamadas: Record<keyof Camadas, string> = {
  foto: 'Foto aérea',
  divisas: 'Divisas e medidas',
  recuo: 'Recuo de 5 m',
  mata: 'Reserva e árvores',
  relevo: 'Relevo e cotas',
}

interface Estado {
  vista: Vista
  camadas: Camadas
  exagero: number
  intervaloCurvas: number
  ferramenta: Ferramenta
  /** Material escolhido na ferramenta de pintar o chão e os cantos já marcados. */
  materialPiso: MaterialPiso
  rascunho: Vec2[]
  /** Andando pelo terreno em primeira pessoa (só no 3D). */
  caminhando: boolean
  cursor: { x: number; y: number; z: number } | null
  setVista: (v: Vista) => void
  alternar: (c: keyof Camadas) => void
  setExagero: (v: number) => void
  setIntervalo: (v: number) => void
  setFerramenta: (f: Ferramenta) => void
  setMaterialPiso: (m: MaterialPiso) => void
  setRascunho: (r: Vec2[]) => void
  setCaminhando: (c: boolean) => void
  setCursor: (c: Estado['cursor']) => void
}

// Preferências de tela ficam salvas no próprio computador e sobrevivem às atualizações do app.
export const useEstado = create<Estado>()(
  persist(
    (set) => ({
      vista: '3d',
      camadas: { foto: true, divisas: true, recuo: true, mata: true, relevo: false },
      exagero: 1,
      intervaloCurvas: 0.5,
      ferramenta: 'selecionar',
      materialPiso: 'asfalto',
      rascunho: [],
      caminhando: false,
      cursor: null,
      setVista: (vista) => set({ vista }),
      alternar: (c) => set((s) => ({ camadas: { ...s.camadas, [c]: !s.camadas[c] } })),
      setExagero: (exagero) => set({ exagero }),
      setIntervalo: (intervaloCurvas) => set({ intervaloCurvas }),
      setFerramenta: (ferramenta) => set({ ferramenta, rascunho: [] }),
      setMaterialPiso: (materialPiso) => set({ materialPiso }),
      setRascunho: (rascunho) => set({ rascunho }),
      setCaminhando: (caminhando) => set({ caminhando }),
      setCursor: (cursor) => set({ cursor }),
    }),
    {
      name: 'planta-keuva:preferencias',
      version: 2,
      partialize: ({ vista, camadas, exagero, intervaloCurvas }) => ({ vista, camadas, exagero, intervaloCurvas }),
      // A versão 0.1.0 tinha vista dividida e camadas diferentes: volta ao padrão novo.
      migrate: (salvo, versao) => {
        const s = (salvo ?? {}) as Record<string, unknown>
        if (versao < 2) return { exagero: s.exagero ?? 1, intervaloCurvas: s.intervaloCurvas ?? 0.5 }
        return s
      },
    },
  ),
)
