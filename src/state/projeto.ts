import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'
import { terreno, extensao } from '../data/terreno'
import type { Vec2 } from '../geo/polygon'
import { ElevationModel, type Cota } from '../geo/elevation'

export type { Cota }

const cotasDaFoto: Cota[] = terreno.cotas.map((c) => ({ ...c, origem: 'foto' as const }))

interface Projeto {
  cotas: Cota[]
  historico: Cota[][]
  selecionada: string | null
  adicionarCota: (x: number, y: number, z: number) => string
  editarCota: (id: string, dados: Partial<Omit<Cota, 'id'>>, registrar?: boolean) => void
  removerCota: (id: string) => void
  restaurarCotasDaFoto: () => void
  desfazer: () => void
  selecionar: (id: string | null) => void
  /** Guarda o estado atual no histórico (antes de arrastar um ponto, por exemplo). */
  marcar: () => void
}

const LIMITE_HISTORICO = 100

function proximoId(cotas: Cota[]) {
  let n = 1
  const usados = new Set(cotas.map((c) => c.id))
  while (usados.has(`P${n}`)) n++
  return `P${n}`
}

// Dados do projeto ficam salvos no computador e sobrevivem às atualizações do app.
export const useProjeto = create<Projeto>()(
  persist(
    (set, get) => {
      const comHistorico = (cotas: Cota[]) => ({
        cotas,
        historico: [...get().historico, get().cotas].slice(-LIMITE_HISTORICO),
      })
      return {
        cotas: cotasDaFoto,
        historico: [],
        selecionada: null,
        adicionarCota: (x, y, z) => {
          const id = proximoId(get().cotas)
          set({ ...comHistorico([...get().cotas, { id, x, y, z, origem: 'manual' }]), selecionada: id })
          return id
        },
        editarCota: (id, dados, registrar = true) => {
          const cotas = get().cotas.map((c) => (c.id === id ? { ...c, ...dados } : c))
          set(registrar ? comHistorico(cotas) : { cotas })
        },
        removerCota: (id) => {
          if (get().cotas.length <= 3) return // o relevo precisa de pelo menos 3 pontos
          set({ ...comHistorico(get().cotas.filter((c) => c.id !== id)), selecionada: null })
        },
        restaurarCotasDaFoto: () => set({ ...comHistorico(cotasDaFoto), selecionada: null }),
        desfazer: () => {
          const h = get().historico
          if (!h.length) return
          set({ cotas: h[h.length - 1], historico: h.slice(0, -1) })
        },
        selecionar: (selecionada) => set({ selecionada }),
        marcar: () => set({ historico: [...get().historico, get().cotas].slice(-LIMITE_HISTORICO) }),
      }
    },
    {
      name: 'planta-keuva:projeto',
      version: 1,
      partialize: ({ cotas }) => ({ cotas }),
    },
  ),
)

/** Modelo de relevo recalculado sempre que as cotas mudam. */
export function useElevacao() {
  const cotas = useProjeto((p) => p.cotas)
  return useMemo(() => new ElevationModel(cotas, cobertura), [cotas])
}

/** Cantos e meios das bordas da área de trabalho + vértices do lote. */
const cobertura: Vec2[] = (() => {
  const e = extensao, m = 20
  const xs = [e.minX - m, (e.minX + e.maxX) / 2, e.maxX + m]
  const ys = [e.minY - m, (e.minY + e.maxY) / 2, e.maxY + m]
  const borda = xs.flatMap((x) => ys.map((y) => [x, y] as Vec2)).filter(([x, y]) => x !== xs[1] || y !== ys[1])
  return [...borda, ...Object.values(terreno.vertices)]
})()
