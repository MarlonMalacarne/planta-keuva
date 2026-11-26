import { lazy, Suspense, useEffect } from 'react'
import Plan2D from './views/Plan2D'
import BarraFerramentas from './ui/BarraFerramentas'
import PainelProjeto from './ui/PainelProjeto'
import Inspetor from './ui/Inspetor'
import BarraStatus from './ui/BarraStatus'
import AvisoAtualizacao from './ui/AvisoAtualizacao'
import AvisoTela from './ui/AvisoTela'
import { useEstado, type Vista } from './state/store'
import { useProjeto } from './state/projeto'

const Scene3D = lazy(() => import('./views/Scene3D'))

const vistas: { id: Vista; nome: string }[] = [
  { id: '2d', nome: '2D' },
  { id: '3d', nome: '3D' },
]

/** Atalhos de teclado do app inteiro. */
function useAtalhos() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const est = useEstado.getState()
      const p = useProjeto.getState()
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (cmd && k === 'z') {
        e.preventDefault()
        p.desfazer()
      } else if (cmd && k === 'd' && p.selecao?.tipo === 'elemento') {
        e.preventDefault()
        p.duplicarElemento(p.selecao.id)
      } else if (cmd) return
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (p.selecao?.tipo === 'elemento') p.removerElemento(p.selecao.id)
        else if (p.selecao?.tipo === 'cota') p.removerCota(p.selecao.id)
        else if (p.selecao?.tipo === 'arvores') p.removerArvores(p.selecao.ids)
      } else if (e.key === 'Escape') {
        est.setFerramenta('selecionar')
        p.selecionar(null)
      } else if (k === 'v' || k === 'm') est.setFerramenta('selecionar')
      else if (k === 'c') est.setFerramenta('cota')
      else if (k === '2') est.setVista('2d')
      else if (k === '3') est.setVista('3d')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const { vista, setVista, ferramenta } = useEstado()
  useAtalhos()
  return (
    <div className="app">
      <div className="palco">
        {vista === '2d' ? (
          <Plan2D />
        ) : (
          <Suspense fallback={<div className="carregando">Carregando 3D…</div>}>
            <Scene3D />
          </Suspense>
        )}
      </div>

      <header className="topo">
        <div className="marca vidro">
          <span className="logo" aria-hidden />
          <b>Planta Keuva</b>
          <nav className="alternador" aria-label="Vista">
            {vistas.map((v) => (
              <button key={v.id} className={vista === v.id ? 'ativo' : ''} onClick={() => setVista(v.id)} title={`Vista ${v.nome} (${v.id === '2d' ? 2 : 3})`}>
                {v.nome}
              </button>
            ))}
          </nav>
        </div>
        <BarraFerramentas />
        <div className="topo-dir" />
      </header>

      {ferramenta === 'cota' && <div className="dica-ferramenta vidro">Clique no terreno onde você mediu o nível e digite a cota no painel. Esc para sair.</div>}

      <PainelProjeto />
      <Inspetor />
      <AvisoAtualizacao />
      <AvisoTela />
      <BarraStatus />
    </div>
  )
}
