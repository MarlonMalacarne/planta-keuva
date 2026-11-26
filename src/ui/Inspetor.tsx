import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Crosshair, Trash2 } from 'lucide-react'
import { calcularResumo, terreno, fmt } from '../data/terreno'
import { useElevacao, useProjeto, type Cota, type Elemento } from '../state/projeto'
import { areaProjecao, catalogo, coresSugeridas, volume } from '../model/elementos'
import { CampoNumero } from './Campos'
import { iconeElemento } from './icones'

export default function Inspetor() {
  const { selecao, elementos, cotas } = useProjeto()
  const el = selecao?.tipo === 'elemento' ? elementos.find((e) => e.id === selecao.id) : undefined
  const cota = selecao?.tipo === 'cota' ? cotas.find((c) => c.id === selecao.id) : undefined
  return (
    <aside className="painel painel-dir vidro">
      {el ? <InspetorElemento key={el.id} e={el} /> : cota ? <InspetorCota key={cota.id} c={cota} /> : <ResumoTerreno />}
    </aside>
  )
}

function InspetorElemento({ e }: { e: Elemento }) {
  const { editarElemento, duplicarElemento, removerElemento } = useProjeto()
  const ed = (d: Partial<Elemento>) => editarElemento(e.id, d)
  const I = iconeElemento[e.tipo]
  return (
    <div className="inspetor">
      <div className="titulo-inspetor">
        <span className="icone-tipo" style={{ background: e.cor }}>
          <I size={16} />
        </span>
        <input className="nome" value={e.nome} onChange={(ev) => editarElemento(e.id, { nome: ev.target.value }, false)} aria-label="Nome" />
      </div>
      <p className="tipo">{catalogo[e.tipo].nome}</p>

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
            <CampoNumero rotulo={e.tipo === 'muro' ? 'Espessura' : 'Largura'} valor={e.largura} min={0.05} onSalvar={(largura) => ed({ largura })} />
            <CampoNumero rotulo="Comprimento" valor={e.comprimento} min={0.1} onSalvar={(comprimento) => ed({ comprimento })} />
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
      <p className="dica">Arraste as setas no 3D para mover. R gira, E redimensiona, V volta a mover.</p>
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
        <div className="cartao">
          <span>Recuo (5 m)</span>
          <b>{fmt.m2(r.areaRecuo)}</b>
        </div>
        <div className="cartao">
          <span>Mata</span>
          <b>{fmt.m2(r.areaMata)}</b>
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
        Divisas tiradas da foto do levantamento (erro menor que 10 cm). A área livre desconta o recuo e a mata, que é aproximada.
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
