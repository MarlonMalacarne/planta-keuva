import { useEffect, useRef, useState } from 'react'
import { useEstado } from '../state/store'
import { useProjeto, type Cota } from '../state/projeto'

const n3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false })

/** Campo numérico que aceita vírgula ou ponto e só grava ao confirmar. */
function CampoNumero({ valor, onSalvar, autoFocus, rotulo }: { valor: number; onSalvar: (v: number) => void; autoFocus?: boolean; rotulo: string }) {
  const [texto, setTexto] = useState(n3(valor))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setTexto(n3(valor))
  }, [valor])
  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); ref.current?.select() }
  }, [autoFocus])
  const salvar = () => {
    const v = Number(texto.replace(',', '.').trim()) // aceita "780,50" e "780.50"
    if (texto.trim() !== '' && Number.isFinite(v) && v !== valor) onSalvar(v)
    else setTexto(n3(valor))
  }
  return (
    <input
      ref={ref}
      aria-label={rotulo}
      className="campo-numero"
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setTexto(n3(valor)); (e.target as HTMLInputElement).blur() }
      }}
    />
  )
}

export default function PainelCotas() {
  const { cotas, selecionada, selecionar, editarCota, removerCota, restaurarCotasDaFoto, desfazer, historico } = useProjeto()
  const { ferramenta, setFerramenta } = useEstado()
  const sel = cotas.find((c) => c.id === selecionada)
  const linhaSel = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    linhaSel.current?.scrollIntoView({ block: 'nearest' })
  }, [selecionada])

  const ordenadas = [...cotas].sort((a, b) => (a.origem === b.origem ? 0 : a.origem === 'manual' ? -1 : 1))

  return (
    <div className="painel-cotas">
      <p className="nota" style={{ marginTop: 0 }}>
        Meça o nível em campo (mangueira de nível, nível a laser ou GPS) e marque cada ponto na planta. O relevo, as curvas de
        nível e o 3D se ajustam na hora.
      </p>
      <div className="acoes">
        <button className={ferramenta === 'cota' ? 'botao-primario' : 'botao-pequeno'} onClick={() => setFerramenta(ferramenta === 'cota' ? 'selecionar' : 'cota')}>
          {ferramenta === 'cota' ? 'Clique na planta…' : '⌖ Nova cota'}
        </button>
        <button className="botao-pequeno" onClick={desfazer} disabled={!historico.length} title="Cmd+Z">
          Desfazer
        </button>
      </div>

      {sel && <EditorCota c={sel} onEditar={(d) => editarCota(sel.id, d)} onRemover={() => removerCota(sel.id)} podeRemover={cotas.length > 3} />}

      <h3>{cotas.length} pontos</h3>
      <table className="tabela-cotas">
        <thead>
          <tr>
            <th>Ponto</th>
            <th>Cota (m)</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => (
            <tr key={c.id} ref={c.id === selecionada ? linhaSel : undefined} className={c.id === selecionada ? 'sel' : ''} onClick={() => selecionar(c.id)}>
              <td>{c.id}</td>
              <td>{n3(c.z)}</td>
              <td className={c.origem === 'manual' ? 'manual' : ''}>{c.origem === 'manual' ? 'manual' : 'foto'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="botao-pequeno restaurar"
        onClick={restaurarCotasDaFoto}
        title="Remove os pontos inseridos por você (dá para desfazer)"
      >
        Restaurar cotas da foto
      </button>
    </div>
  )
}

function EditorCota({ c, onEditar, onRemover, podeRemover }: { c: Cota; onEditar: (d: Partial<Cota>) => void; onRemover: () => void; podeRemover: boolean }) {
  return (
    <div className="editor-cota">
      <div className="titulo">
        <b>{c.id}</b>
        <span className={c.origem === 'manual' ? 'etiqueta manual' : 'etiqueta'}>{c.origem === 'manual' ? 'inserida por você' : 'lida da foto'}</span>
      </div>
      <label>
        Cota (nível) em metros
        <CampoNumero key={c.id} rotulo="Cota" valor={c.z} onSalvar={(z) => onEditar({ z, origem: 'manual' })} autoFocus={c.origem === 'manual'} />
      </label>
      <div className="duas">
        <label>
          X (leste)
          <CampoNumero rotulo="X" valor={c.x} onSalvar={(x) => onEditar({ x })} />
        </label>
        <label>
          Y (norte)
          <CampoNumero rotulo="Y" valor={c.y} onSalvar={(y) => onEditar({ y })} />
        </label>
      </div>
      <label>
        Observação
        <input className="campo-texto" defaultValue={c.nota ?? ''} key={c.id + 'n'} placeholder="ex.: canto do muro, piquete 3" onBlur={(e) => e.target.value !== (c.nota ?? '') && onEditar({ nota: e.target.value })} />
      </label>
      <button className="botao-perigo" onClick={onRemover} disabled={!podeRemover}>
        Apagar ponto
      </button>
    </div>
  )
}
