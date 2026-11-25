import { lazy, Suspense } from 'react'
import Plan2D from './views/Plan2D'
import Camadas from './ui/Camadas'
import PainelDireito from './ui/PainelDireito'
import BarraStatus from './ui/BarraStatus'
import AvisoAtualizacao from './ui/AvisoAtualizacao'
import { useEstado, type Vista } from './state/store'

const Scene3D = lazy(() => import('./views/Scene3D'))

const vistas: { id: Vista; nome: string }[] = [
  { id: '2d', nome: 'Planta 2D' },
  { id: 'dividida', nome: '2D + 3D' },
  { id: '3d', nome: 'Vista 3D' },
]

export default function App() {
  const { vista, setVista } = useEstado()
  return (
    <div className="app">
      <header className="barra-topo">
        <div className="marca">
          <span className="logo" aria-hidden>◆</span>
          <b>Planta Keuva</b>
          <span className="sub">Terreno</span>
        </div>
        <nav className="abas" aria-label="Vista">
          {vistas.map((v) => (
            <button key={v.id} className={vista === v.id ? 'ativa' : ''} onClick={() => setVista(v.id)}>
              {v.nome}
            </button>
          ))}
        </nav>
        <div className="modulos" title="Próximos passos do plano">
          <span className="em-breve">Terraplanagem</span>
          <span className="em-breve">Modelagem</span>
          <span className="em-breve">Obra e custos</span>
        </div>
      </header>
      <AvisoAtualizacao />
      <main className={`area vista-${vista}`}>
        <Camadas />
        <div className="vistas">
          {vista !== '3d' && <Plan2D />}
          {vista !== '2d' && (
            <Suspense fallback={<div className="carregando">Carregando 3D…</div>}>
              <Scene3D />
            </Suspense>
          )}
        </div>
        <PainelDireito />
      </main>
      <BarraStatus />
    </div>
  )
}
