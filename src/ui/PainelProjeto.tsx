import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, LandPlot } from 'lucide-react'
import { nomesCamadas, useEstado, type Camadas } from '../state/store'
import { useProjeto } from '../state/projeto'
import { iconeElemento } from './icones'

export default function PainelProjeto() {
  const { camadas, alternar, exagero, setExagero, intervaloCurvas, setIntervalo } = useEstado()
  const { elementos, selecao, selecionar, cotas } = useProjeto()
  const [ajustes, setAjustes] = useState(false)

  return (
    <aside className="painel painel-esq vidro">
      <section>
        <h3>Projeto</h3>
        <button className={`item ${!selecao ? 'ativo' : ''}`} onClick={() => selecionar(null)}>
          <LandPlot size={15} /> Terreno <small>2,02 ha</small>
        </button>
        {elementos.map((e) => {
          const I = iconeElemento[e.tipo]
          const ativo = selecao?.tipo === 'elemento' && selecao.id === e.id
          return (
            <button key={e.id} className={`item recuado ${ativo ? 'ativo' : ''}`} onClick={() => selecionar({ tipo: 'elemento', id: e.id })}>
              <I size={15} /> {e.nome}
            </button>
          )
        })}
        {!elementos.length && <p className="vazio">Use “Adicionar” para colocar galpões, prédios e tanques.</p>}
      </section>

      <section>
        <h3>Exibir</h3>
        {(Object.keys(nomesCamadas) as (keyof Camadas)[]).map((k) => (
          <button key={k} className={`item camada ${camadas[k] ? '' : 'apagada'}`} onClick={() => alternar(k)} aria-pressed={camadas[k]}>
            <span className={`amostra amostra-${k}`} />
            {nomesCamadas[k]}
            {k === 'relevo' && <small>{cotas.length} cotas</small>}
            {camadas[k] ? <Eye size={14} className="olho" /> : <EyeOff size={14} className="olho" />}
          </button>
        ))}
      </section>

      <section>
        <button className="cabecalho-dobravel" onClick={() => setAjustes(!ajustes)}>
          {ajustes ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Ajustes do relevo
        </button>
        {ajustes && (
          <div className="ajustes">
            <label className="campo">
              Curvas de nível a cada
              <select value={intervaloCurvas} onChange={(e) => setIntervalo(Number(e.target.value))}>
                {[0.25, 0.5, 1, 2].map((v) => (
                  <option key={v} value={v}>
                    {v.toLocaleString('pt-BR')} m
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              Exagero vertical no 3D: <b>{exagero}×</b>
              <input type="range" min={1} max={5} step={0.5} value={exagero} onChange={(e) => setExagero(Number(e.target.value))} />
            </label>
          </div>
        )}
      </section>
    </aside>
  )
}
