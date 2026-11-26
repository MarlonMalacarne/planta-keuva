import { area, dist, type Vec2 } from '../geo/polygon'
import { terreno } from '../data/terreno'
import { contorno } from '../model/elementos'
import { useEstado } from './store'
import { useProjeto } from './projeto'

const arred = (v: number) => Math.round(v * 100) / 100

/** Cantos onde um ponto novo "gruda": vértices do lote, de outros pisos e dos elementos. */
function cantosConhecidos(): Vec2[] {
  const { pisos, elementos } = useProjeto.getState()
  return [...Object.values(terreno.vertices), ...pisos.flatMap((p) => p.pontos), ...elementos.filter((e) => e.tipo !== 'tanque').flatMap(contorno)]
}

/** Ponto do desenho: gruda num canto conhecido a menos de `tolerancia` metros, senão vai para o centímetro. */
export function encaixar(p: Vec2, tolerancia: number): Vec2 {
  let melhor: Vec2 | null = null
  let d = tolerancia
  for (const c of cantosConhecidos()) {
    const dc = dist(c, p)
    if (dc < d) {
      d = dc
      melhor = c
    }
  }
  return melhor ? [melhor[0], melhor[1]] : [arred(p[0]), arred(p[1])]
}

/**
 * Marca um canto do piso que está sendo desenhado. Clicar perto do primeiro canto fecha o piso.
 * `tolerancia` é a distância (m) que conta como "em cima" de um canto.
 */
export function marcarCanto(p: Vec2, tolerancia: number) {
  const { rascunho, setRascunho } = useEstado.getState()
  if (rascunho.length >= 3 && dist(rascunho[0], p) < tolerancia) return concluirPiso()
  const q = encaixar(p, tolerancia)
  // O clique duplo para concluir manda dois cliques antes: não repete o mesmo canto.
  if (rascunho.length && dist(rascunho[rascunho.length - 1], q) < tolerancia / 2) return
  if (!rascunho.length) useProjeto.getState().selecionar(null)
  setRascunho([...rascunho, q])
}

export function desfazerCanto() {
  const { rascunho, setRascunho } = useEstado.getState()
  setRascunho(rascunho.slice(0, -1))
}

/** Fecha o piso desenhado e seleciona; volta para a ferramenta de seleção. */
export function concluirPiso(pontos = useEstado.getState().rascunho) {
  const est = useEstado.getState()
  if (pontos.length < 3 || area(pontos) < 0.5) return
  const id = useProjeto.getState().adicionarPiso(est.materialPiso, pontos)
  if (id) est.setFerramenta('selecionar')
}
