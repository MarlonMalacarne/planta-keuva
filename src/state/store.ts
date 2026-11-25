import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Vista = '2d' | '3d' | 'dividida'
export type Ferramenta = 'selecionar' | 'cota'
export type Aba = 'resumo' | 'cotas'

export interface Camadas {
  foto: boolean
  perimetro: boolean
  medidas: boolean
  recuo: boolean
  mata: boolean
  arvores: boolean
  curvas: boolean
  cotas: boolean
  grade: boolean
}

export const nomesCamadas: Record<keyof Camadas, string> = {
  foto: 'Foto aérea',
  perimetro: 'Divisas do lote',
  medidas: 'Medidas dos lados',
  recuo: 'Faixa de recuo (5 m)',
  mata: 'Área de mata',
  arvores: 'Árvores em 3D',
  curvas: 'Curvas de nível',
  cotas: 'Pontos cotados',
  grade: 'Grade de 10 m',
}

interface Estado {
  vista: Vista
  camadas: Camadas
  exagero: number
  intervaloCurvas: number
  cursor: { x: number; y: number; z: number } | null
  ferramenta: Ferramenta
  aba: Aba
  setFerramenta: (f: Ferramenta) => void
  setAba: (a: Aba) => void
  setVista: (v: Vista) => void
  alternar: (c: keyof Camadas) => void
  setExagero: (v: number) => void
  setIntervalo: (v: number) => void
  setCursor: (c: Estado['cursor']) => void
}

// Preferências de tela ficam salvas no próprio computador e sobrevivem às atualizações do app.
export const useEstado = create<Estado>()(
  persist(
    (set) => ({
      vista: 'dividida',
      camadas: {
        foto: true,
        perimetro: true,
        medidas: true,
        recuo: true,
        mata: true,
        arvores: true,
        curvas: true,
        cotas: true,
        grade: false,
      },
      exagero: 1,
      intervaloCurvas: 0.5,
      cursor: null,
      ferramenta: 'selecionar',
      aba: 'resumo',
      setFerramenta: (ferramenta) => set({ ferramenta }),
      setAba: (aba) => set({ aba }),
      setVista: (vista) => set({ vista }),
      alternar: (c) => set((s) => ({ camadas: { ...s.camadas, [c]: !s.camadas[c] } })),
      setExagero: (exagero) => set({ exagero }),
      setIntervalo: (intervaloCurvas) => set({ intervaloCurvas }),
      setCursor: (cursor) => set({ cursor }),
    }),
    {
      name: 'planta-keuva:preferencias',
      version: 1,
      partialize: ({ vista, camadas, exagero, intervaloCurvas }) => ({ vista, camadas, exagero, intervaloCurvas }),
    },
  ),
)
