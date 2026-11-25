import { terreno } from '../data/terreno'
import { useEstado } from '../state/store'
import Resumo from './Resumo'
import PainelCotas from './PainelCotas'

export default function PainelDireito() {
  const { aba, setAba } = useEstado()
  return (
    <aside className="painel painel-dir">
      <h2>{terreno.nome}</h2>
      <nav className="abas abas-painel">
        <button className={aba === 'resumo' ? 'ativa' : ''} onClick={() => setAba('resumo')}>
          Resumo
        </button>
        <button className={aba === 'cotas' ? 'ativa' : ''} onClick={() => setAba('cotas')}>
          Cotas do relevo
        </button>
      </nav>
      {aba === 'resumo' ? <Resumo /> : <PainelCotas />}
    </aside>
  )
}
