import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, LandPlot, Route, Sparkles, TreeDeciduous } from 'lucide-react'
import { areaPiso } from '../model/pisos'
import { fmt } from '../data/terreno'
import type { Elemento } from '../model/elementos'
import { propostaVinicola } from '../model/propostaVinicola'
import { nomesCamadas, useEstado, type Camadas } from '../state/store'
import { useProjeto, type Selecao } from '../state/projeto'
import { iconeElemento } from './icones'

export default function PainelProjeto() {
  const { camadas, alternar, exagero, setExagero, intervaloCurvas, setIntervalo } = useEstado()
  const { elementos, pisos, fluxos, selecao, selecionar, cotas, arvores, restaurarArvores } = useProjeto()
  const todasArvores = selecao?.tipo === 'arvores' && selecao.ids.length === arvores.length && arvores.length > 0
  const [ajustes, setAjustes] = useState(false)

  return (
    <aside className="painel painel-esq vidro">
      <section>
        <h3>Projeto</h3>
        <button className={`item ${!selecao ? 'ativo' : ''}`} onClick={() => selecionar(null)}>
          <LandPlot size={15} /> Terreno <small>2,02 ha</small>
        </button>
        {agrupar(elementos).map((g) =>
          g.length === 1 ? (
            <ItemElemento key={g[0].id} e={g[0]} selecao={selecao} selecionar={selecionar} />
          ) : (
            <GrupoTanques key={g[0].id} lista={g} selecao={selecao} selecionar={selecionar} />
          ),
        )}
        {pisos.map((p) => (
          <button key={p.id} className={`item recuado ${selecao?.tipo === 'piso' && selecao.id === p.id ? 'ativo' : ''}`} onClick={() => selecionar({ tipo: 'piso', id: p.id })}>
            <span className={`amostra-piso pequena piso-${p.material}`} /> {p.nome} <small>{fmt.m2(areaPiso(p))}</small>
          </button>
        ))}
        {fluxos.map((f) => (
          <button key={f.id} className={`item recuado ${selecao?.tipo === 'fluxo' && selecao.id === f.id ? 'ativo' : ''}`} onClick={() => selecionar({ tipo: 'fluxo', id: f.id })}>
            <Route size={15} style={{ color: f.cor }} /> {f.nome}
          </button>
        ))}
        {!elementos.length && !pisos.length && <p className="vazio">Use “Adicionar” para colocar galpões, prédios e tanques.</p>}
        {arvores.length > 0 ? (
          <button className={`item recuado ${todasArvores ? 'ativo' : ''}`} onClick={() => selecionar({ tipo: 'arvores', ids: arvores.map((a) => a.id) })} title="Seleciona todas as árvores">
            <TreeDeciduous size={15} /> Árvores <small>{arvores.length.toLocaleString('pt-BR')}</small>
          </button>
        ) : (
          <button className="item recuado apagado" onClick={restaurarArvores}>
            <TreeDeciduous size={15} /> Repor as árvores
          </button>
        )}
      </section>

      <Propostas />

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

/** Tanques do mesmo diâmetro viram um grupo na lista (a proposta tem 150). */
function agrupar(elementos: Elemento[]): Elemento[][] {
  const grupos: Elemento[][] = []
  const porDiametro = new Map<number, Elemento[]>()
  for (const e of elementos) {
    if (e.tipo !== 'tanque') {
      grupos.push([e])
      continue
    }
    const g = porDiametro.get(e.largura)
    if (g) g.push(e)
    else {
      const novo = [e]
      porDiametro.set(e.largura, novo)
      grupos.push(novo)
    }
  }
  return grupos
}

type Sel = { selecao: Selecao; selecionar: (s: Selecao) => void }

function ItemElemento({ e, selecao, selecionar, classe = 'recuado' }: Sel & { e: Elemento; classe?: string }) {
  const I = iconeElemento[e.tipo]
  const ativo = selecao?.tipo === 'elemento' && selecao.id === e.id
  return (
    <button className={`item ${classe} ${ativo ? 'ativo' : ''}`} onClick={() => selecionar({ tipo: 'elemento', id: e.id })}>
      <I size={15} /> {e.nome}
    </button>
  )
}

function GrupoTanques({ lista, selecao, selecionar }: Sel & { lista: Elemento[] }) {
  const [aberto, setAberto] = useState(false)
  const temSelecao = selecao?.tipo === 'elemento' && lista.some((e) => e.id === selecao.id)
  const I = iconeElemento.tanque
  return (
    <>
      <button className={`item recuado ${temSelecao && !aberto ? 'ativo' : ''}`} onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <I size={15} /> Tanques Ø {lista[0].largura.toLocaleString('pt-BR')} m <small>{lista.length}</small>
      </button>
      {(aberto || temSelecao) &&
        lista
          .filter((e) => aberto || (selecao?.tipo === 'elemento' && e.id === selecao.id))
          .map((e) => <ItemElemento key={e.id} e={e} selecao={selecao} selecionar={selecionar} classe="recuado2" />)}
    </>
  )
}

/** Proposta de layout pronta: carrega no projeto (um Cmd+Z volta ao que estava). */
function Propostas() {
  const { elementos, pisos, fluxos, carregarProposta, avisar } = useProjeto()
  const temAlgo = elementos.length + pisos.length + fluxos.length > 0
  const carregar = () => {
    carregarProposta(propostaVinicola())
    avisar(temAlgo ? 'Proposta da vinícola carregada. Cmd+Z volta ao que estava.' : 'Proposta da vinícola carregada.')
  }
  return (
    <section>
      <h3>Propostas</h3>
      <div className="proposta">
        <span className="icone-menu">
          <Sparkles size={16} />
        </span>
        <span>
          <b>Layout da vinícola</b>
          <small>Pavilhão de 1.800 m², 150 tanques, asfalto, portão e fluxo das carretas</small>
        </span>
      </div>
      <button className="botao-secundario largo" onClick={carregar} title={temAlgo ? 'Troca os elementos, pisos e caminhos atuais pelos da proposta' : undefined}>
        {temAlgo ? 'Carregar no lugar do atual' : 'Carregar proposta'}
      </button>
    </section>
  )
}
