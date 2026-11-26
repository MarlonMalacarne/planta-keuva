import { Check, Undo2, X } from 'lucide-react'
import { area } from '../geo/polygon'
import { fmt } from '../data/terreno'
import { useEstado } from '../state/store'
import { concluirPiso, desfazerCanto } from '../state/desenho'
import { materiais, ordemMateriais } from '../model/pisos'

/** Escolha do material e controles enquanto se pinta o chão. */
export default function PaletaPiso() {
  const { materialPiso, setMaterialPiso, rascunho, setRascunho, vista } = useEstado()
  const n = rascunho.length
  return (
    <div className="paleta-piso vidro">
      <div className="materiais" role="radiogroup" aria-label="Material do chão">
        {ordemMateriais.map((m) => (
          <button key={m} role="radio" aria-checked={m === materialPiso} className={m === materialPiso ? 'ativo' : ''} onClick={() => setMaterialPiso(m)} title={materiais[m].descricao}>
            <span className={`amostra-piso piso-${m}`} />
            {materiais[m].nome}
          </button>
        ))}
      </div>
      <span className="separador" />
      <span className="estado">
        {n === 0
          ? vista === '2d'
            ? 'Clique nos cantos · Shift + arraste faz um retângulo'
            : 'Clique no chão para marcar os cantos'
          : n < 3
            ? `${n} ${n === 1 ? 'canto' : 'cantos'} · marque pelo menos 3`
            : `${n} cantos · ${fmt.m2(area(rascunho))}`}
      </span>
      <button className="botao-icone" onClick={desfazerCanto} disabled={!n} title="Tirar o último canto (Delete)">
        <Undo2 size={16} />
      </button>
      <button className="botao-icone" onClick={() => setRascunho([])} disabled={!n} title="Cancelar (Esc)">
        <X size={16} />
      </button>
      <button className="botao-primario" onClick={() => concluirPiso()} disabled={n < 3} title="Concluir (Enter ou clique duplo)">
        <Check size={16} strokeWidth={2.4} /> Concluir
      </button>
    </div>
  )
}
