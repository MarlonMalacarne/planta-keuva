import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Crosshair, PaintRoller, Route, ShieldAlert, Trash2, TreeDeciduous } from 'lucide-react'
import { calcularResumo, terreno, fmt } from '../data/terreno'
import { useElevacao, useProjeto, type Arvore, type Cota, type Elemento, type Fluxo, type Piso } from '../state/projeto'
import { areaProjecao, catalogo, coresSugeridas, finoComoMuro, volume } from '../model/elementos'
import { areaInvadida } from '../model/protecao'
import { situacaoArvore } from '../model/arvores'
import { areaPiso, materiais, nomeAutomatico, ordemMateriais, perimetroPiso, type MaterialPiso } from '../model/pisos'
import { comprimentoFluxo, coresFluxo } from '../model/fluxos'
import { CampoNumero } from './Campos'
import { iconeElemento } from './icones'

export default function Inspetor() {
  const { selecao, elementos, cotas, arvores, pisos, fluxos } = useProjeto()
  const fluxo = selecao?.tipo === 'fluxo' ? fluxos.find((f) => f.id === selecao.id) : undefined
  const piso = selecao?.tipo === 'piso' ? pisos.find((p) => p.id === selecao.id) : undefined
  const el = selecao?.tipo === 'elemento' ? elementos.find((e) => e.id === selecao.id) : undefined
  const cota = selecao?.tipo === 'cota' ? cotas.find((c) => c.id === selecao.id) : undefined
  const ids = selecao?.tipo === 'arvores' ? new Set(selecao.ids) : null
  const arvs = ids ? arvores.filter((a) => ids.has(a.id)) : []
  return (
    <aside className="painel painel-dir vidro">
      {el ? <InspetorElemento key={el.id} e={el} /> : piso ? <InspetorPiso key={piso.id} p={piso} /> : fluxo ? <InspetorFluxo key={fluxo.id} f={fluxo} /> : cota ? <InspetorCota key={cota.id} c={cota} /> : arvs.length ? <InspetorArvores key={arvs.length === 1 ? arvs[0].id : 'varias'} lista={arvs} /> : <ResumoTerreno />}
    </aside>
  )
}

function InspetorElemento({ e }: { e: Elemento }) {
  const { editarElemento, duplicarElemento, removerElemento } = useProjeto()
  const ed = (d: Partial<Elemento>) => editarElemento(e.id, d)
  const I = iconeElemento[e.tipo]
  const invadida = areaInvadida(e)
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: e.cor }}>
          <I size={16} />
        </span>
        <input className="nome" value={e.nome} onChange={(ev) => editarElemento(e.id, { nome: ev.target.value }, false)} aria-label="Nome" />
      </div>
      <p className="tipo">{catalogo[e.tipo].nome}</p>
      {invadida && (
        <p className="alerta">
          <ShieldAlert size={15} /> Está dentro da {invadida.nome.toLowerCase()}, onde não pode construir. Arraste para fora.
        </p>
      )}

      <h4>Posição</h4>
      <div className="grade-3">
        <CampoNumero rotulo="X" valor={e.x} onSalvar={(x) => ed({ x })} />
        <CampoNumero rotulo="Y" valor={e.y} onSalvar={(y) => ed({ y })} />
        <CampoNumero rotulo="Giro" valor={e.rot} unidade="°" casas={1} onSalvar={(rot) => ed({ rot: ((rot % 360) + 360) % 360 })} />
      </div>

      <h4>Medidas</h4>
      <div className="grade-3">
        {e.tipo === 'tanque' ? (
          <CampoNumero rotulo="Diâmetro" valor={e.largura} min={0.1} onSalvar={(largura) => ed({ largura })} />
        ) : (
          <>
            <CampoNumero rotulo={finoComoMuro(e) ? 'Espessura' : 'Largura'} valor={e.largura} min={0.05} onSalvar={(largura) => ed({ largura })} />
            <CampoNumero rotulo={e.tipo === 'portao' ? 'Abertura' : 'Comprimento'} valor={e.comprimento} min={0.1} onSalvar={(comprimento) => ed({ comprimento })} />
          </>
        )}
        <CampoNumero rotulo="Altura" valor={e.altura} min={0.1} onSalvar={(altura) => ed({ altura })} />
      </div>

      <h4>Cor</h4>
      <div className="cores">
        {coresSugeridas.map((c) => (
          <button key={c} className={`cor ${c === e.cor ? 'ativa' : ''}`} style={{ background: c }} onClick={() => ed({ cor: c })} aria-label={`Cor ${c}`} />
        ))}
        <label className="cor personalizada" title="Outra cor">
          <input type="color" value={e.cor} onChange={(ev) => editarElemento(e.id, { cor: ev.target.value }, false)} />
        </label>
      </div>

      <div className="metricas">
        <div>
          <span>Área ocupada</span>
          <b>{fmt.m2(areaProjecao(e))}</b>
        </div>
        <div>
          <span>Volume</span>
          <b>{Math.round(volume(e)).toLocaleString('pt-BR')} m³</b>
        </div>
      </div>

      <div className="acoes">
        <button className="botao-secundario" onClick={() => duplicarElemento(e.id)} title="Cmd+D">
          <Copy size={15} /> Duplicar
        </button>
        <button className="botao-perigo" onClick={() => removerElemento(e.id)} title="Delete">
          <Trash2 size={15} /> Apagar
        </button>
      </div>
      <p className="dica">Arraste o elemento para mover. Puxe as setas azuis para esticar uma face e o anel para girar. Segure Shift para passos finos.</p>
    </div>
  )
}

function InspetorPiso({ p }: { p: Piso }) {
  const { editarPiso, removerPiso, pisos } = useProjeto()
  const trocar = (material: MaterialPiso) => {
    // Nome automático acompanha o material ("Asfalto 1" vira "Cascalho 2").
    let nome = p.nome
    if (nomeAutomatico(p.nome)) {
      let n = 1
      while (pisos.some((x) => x.id !== p.id && x.nome === `${materiais[material].nome} ${n}`)) n++
      nome = `${materiais[material].nome} ${n}`
    }
    editarPiso(p.id, { material, nome })
  }
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: materiais[p.material].cor }}>
          <PaintRoller size={16} />
        </span>
        <input className="nome" value={p.nome} onChange={(ev) => editarPiso(p.id, { nome: ev.target.value }, false)} aria-label="Nome" />
      </div>
      <p className="tipo">Piso · {materiais[p.material].descricao.toLowerCase()}</p>

      <h4>Material</h4>
      <div className="grade-materiais">
        {ordemMateriais.map((m) => (
          <button key={m} className={m === p.material ? 'ativo' : ''} onClick={() => trocar(m)} aria-pressed={m === p.material}>
            <span className={`amostra-piso piso-${m}`} />
            {materiais[m].nome}
          </button>
        ))}
      </div>

      <div className="metricas">
        <div>
          <span>Área</span>
          <b>{fmt.m2(areaPiso(p))}</b>
        </div>
        <div>
          <span>Perímetro</span>
          <b>{fmt.m(perimetroPiso(p), 1)}</b>
        </div>
      </div>

      <div className="acoes">
        <button className="botao-perigo" onClick={() => removerPiso(p.id)} title="Delete">
          <Trash2 size={15} /> Apagar piso
        </button>
      </div>
      <p className="dica">Na planta 2D, arraste o piso para mover e puxe os pontos brancos para mudar o formato. Option + clique num ponto tira o canto.</p>
    </div>
  )
}

function InspetorFluxo({ f }: { f: Fluxo }) {
  const { editarFluxo, removerFluxo } = useProjeto()
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: f.cor }}>
          <Route size={16} />
        </span>
        <input className="nome" value={f.nome} onChange={(ev) => editarFluxo(f.id, { nome: ev.target.value }, false)} aria-label="Nome" />
      </div>
      <p className="tipo">Caminho com setas · fluxo de veículos</p>

      <h4>Cor</h4>
      <div className="cores">
        {coresFluxo.map((c) => (
          <button key={c} className={`cor ${c === f.cor ? 'ativa' : ''}`} style={{ background: c }} onClick={() => editarFluxo(f.id, { cor: c })} aria-label={`Cor ${c}`} />
        ))}
      </div>

      <div className="metricas">
        <div>
          <span>Percurso</span>
          <b>{fmt.m(comprimentoFluxo(f), 0)}</b>
        </div>
        <div>
          <span>Pontos</span>
          <b>{f.pontos.length}</b>
        </div>
      </div>

      <div className="acoes">
        <button className="botao-perigo" onClick={() => removerFluxo(f.id)} title="Delete">
          <Trash2 size={15} /> Apagar caminho
        </button>
      </div>
      <p className="dica">Na planta 2D, arraste o caminho para mover e puxe os pontos brancos para mudar o trajeto. Option + clique num ponto tira o ponto.</p>
    </div>
  )
}

function InspetorArvores({ lista }: { lista: Arvore[] }) {
  const { editarArvores, removerArvores } = useProjeto()
  const a = lista[0]
  const varias = lista.length > 1
  const todas = (d: Partial<Arvore>) => editarArvores(Object.fromEntries(lista.map((x) => [x.id, d])))
  const media = (k: 'altura' | 'copa') => Math.round((lista.reduce((s, x) => s + x[k], 0) / lista.length) * 10) / 10
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: '#4f9d69' }}>
          <TreeDeciduous size={16} />
        </span>
        <b className="nome">{varias ? `${lista.length.toLocaleString('pt-BR')} árvores` : `Árvore ${a.id}`}</b>
      </div>
      <p className="tipo">{varias ? 'Mudanças valem para todas as selecionadas' : situacaoArvore(a)}</p>
      {!varias && (
        <>
          <h4>Posição</h4>
          <div className="grade-3 dois">
            <CampoNumero rotulo="X" valor={a.x} onSalvar={(x) => editarArvores({ [a.id]: { x } })} />
            <CampoNumero rotulo="Y" valor={a.y} onSalvar={(y) => editarArvores({ [a.id]: { y } })} />
          </div>
        </>
      )}
      <h4>{varias ? 'Medidas (média)' : 'Medidas'}</h4>
      <div className="grade-3 dois">
        <CampoNumero rotulo="Altura" valor={media('altura')} min={1} casas={1} onSalvar={(altura) => todas({ altura })} />
        <CampoNumero rotulo="Copa (Ø)" valor={media('copa')} min={0.5} casas={1} onSalvar={(copa) => todas({ copa })} />
      </div>
      <div className="acoes">
        <button className="botao-perigo" onClick={() => removerArvores(lista.map((x) => x.id))} title="Delete">
          <Trash2 size={15} /> {varias ? `Apagar ${lista.length.toLocaleString('pt-BR')} árvores` : 'Apagar árvore'}
        </button>
      </div>
      <p className="dica">Arraste para mover. Shift + clique soma árvores à seleção. Na planta 2D, Shift + arraste seleciona uma área inteira.</p>
    </div>
  )
}

function InspetorCota({ c }: { c: Cota }) {
  const { editarCota, removerCota, cotas } = useProjeto()
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: c.origem === 'manual' ? '#1f6f73' : '#7a5a00' }}>
          <Crosshair size={16} />
        </span>
        <b className="nome">Cota {c.id}</b>
      </div>
      <p className="tipo">{c.origem === 'manual' ? 'Medida por você' : 'Lida da foto do levantamento'}</p>
      <h4>Nível</h4>
      <CampoNumero rotulo="Cota" valor={c.z} casas={3} onSalvar={(z) => editarCota(c.id, { z, origem: 'manual' })} autoFocus={c.origem === 'manual'} />
      <h4>Posição</h4>
      <div className="grade-3 dois">
        <CampoNumero rotulo="X" valor={c.x} casas={3} onSalvar={(x) => editarCota(c.id, { x })} />
        <CampoNumero rotulo="Y" valor={c.y} casas={3} onSalvar={(y) => editarCota(c.id, { y })} />
      </div>
      <div className="acoes">
        <button className="botao-perigo" onClick={() => removerCota(c.id)} disabled={cotas.length <= 3}>
          <Trash2 size={15} /> Apagar ponto
        </button>
      </div>
      <p className="dica">Com a ferramenta de cota (C), clique no terreno onde você mediu e digite o nível.</p>
    </div>
  )
}

function ResumoTerreno() {
  const elevacao = useElevacao()
  const { cotas, restaurarCotasDaFoto } = useProjeto()
  const r = useMemo(() => calcularResumo(elevacao), [elevacao])
  const [lados, setLados] = useState(false)
  const manuais = cotas.filter((c) => c.origem === 'manual').length
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <b className="nome">Terreno</b>
      </div>
      <p className="tipo">{fmt.ha(terreno.areaOficialM2)} · perímetro {fmt.m(r.perimetro, 0)}</p>
      <div className="cartoes">
        <div className="cartao">
          <span>Área total</span>
          <b>{fmt.m2(terreno.areaOficialM2)}</b>
        </div>
        <div className="cartao destaque">
          <span>Livre para construir</span>
          <b>{fmt.m2(r.areaLivre)}</b>
        </div>
        <div className="cartao protegido">
          <span>Reserva legal</span>
          <b>{fmt.m2(r.areaReserva)}</b>
        </div>
        <div className="cartao protegido">
          <span>Compensação</span>
          <b>{fmt.m2(r.areaCompensacao)}</b>
        </div>
        <div className="cartao">
          <span>Mata fora do corte</span>
          <b>{fmt.m2(r.areaMataMantida)}</b>
        </div>
        <div className="cartao">
          <span>Recuo (5 m)</span>
          <b>{fmt.m2(r.areaRecuo)}</b>
        </div>
        <div className="cartao">
          <span>Desnível</span>
          <b>{fmt.m(r.zMax - r.zMin)}</b>
        </div>
        <div className="cartao">
          <span>Cotas</span>
          <b>
            {cotas.length} <small>({manuais} suas)</small>
          </b>
        </div>
      </div>
      <button className="cabecalho-dobravel" onClick={() => setLados(!lados)}>
        {lados ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Medidas dos lados
      </button>
      {lados && (
        <table className="tabela-lados">
          <tbody>
            {terreno.lados.map((l) => (
              <tr key={l.de + l.para}>
                <td>
                  {l.de}–{l.para}
                </td>
                <td>{fmt.m(l.m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dica">
        Divisas tiradas da foto do levantamento (erro menor que 10 cm). Reserva legal e compensação vêm do laudo agronômico: nelas não se constrói. A
        supressão de ligustros está autorizada só na área tracejada (0,49 ha); a mata fora dela continua e não conta como área livre.
        {manuais > 0 && (
          <>
            {' '}
            <button className="link" onClick={restaurarCotasDaFoto}>
              Restaurar cotas da foto
            </button>
          </>
        )}
      </p>
    </div>
  )
}
