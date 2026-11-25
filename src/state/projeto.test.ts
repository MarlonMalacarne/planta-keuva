import { beforeEach, describe, expect, it } from 'vitest'
import { useProjeto } from './projeto'
import { ElevationModel } from '../geo/elevation'

describe('cotas editáveis', () => {
  beforeEach(() => useProjeto.getState().restaurarCotasDaFoto())

  it('adiciona, edita e desfaz', () => {
    const p = useProjeto.getState()
    const n = p.cotas.length
    const id = p.adicionarCota(50, 60, 777)
    expect(useProjeto.getState().cotas).toHaveLength(n + 1)
    expect(useProjeto.getState().selecionada).toBe(id)
    useProjeto.getState().editarCota(id, { z: 778.5 })
    expect(useProjeto.getState().cotas.find((c) => c.id === id)?.z).toBe(778.5)
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().cotas.find((c) => c.id === id)?.z).toBe(777)
    useProjeto.getState().desfazer()
    expect(useProjeto.getState().cotas).toHaveLength(n)
  })

  it('o relevo passa pela cota inserida à mão', () => {
    const id = useProjeto.getState().adicionarCota(60, 50, 781.25)
    const c = useProjeto.getState().cotas.find((c) => c.id === id)!
    expect(new ElevationModel(useProjeto.getState().cotas).at(c.x, c.y)).toBeCloseTo(781.25, 6)
  })

  it('não deixa ficar com menos de 3 pontos', () => {
    const s = useProjeto.getState()
    for (const c of [...s.cotas]) useProjeto.getState().removerCota(c.id)
    expect(useProjeto.getState().cotas).toHaveLength(3)
  })
})
