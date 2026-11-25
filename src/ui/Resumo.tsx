import { useMemo } from 'react'
import { calcularResumo, terreno, fmt } from '../data/terreno'
import { useElevacao, useProjeto } from '../state/projeto'

export default function Resumo() {
  const elevacao = useElevacao()
  const nManuais = useProjeto((p) => p.cotas.filter((c) => c.origem === 'manual').length)
  const resumo = useMemo(() => calcularResumo(elevacao), [elevacao])
  const linhas: [string, string, string?][] = [
    ['Área do levantamento', fmt.m2(terreno.areaOficialM2), fmt.ha(terreno.areaOficialM2)],
    ['Área calculada', fmt.m2(resumo.areaTotal), 'conferência'],
    ['Perímetro', fmt.m(resumo.perimetro)],
    ['Faixa de recuo (5 m)', fmt.m2(resumo.areaRecuo), 'não construível'],
    ['Mata (aproximada)', fmt.m2(resumo.areaMata), 'licença ambiental'],
    ['Área livre estimada', fmt.m2(resumo.areaLivre), 'sem recuo e mata'],
    ['Cota mais baixa', fmt.z(resumo.zMin)],
    ['Cota mais alta', fmt.z(resumo.zMax)],
    ['Desnível', fmt.m(resumo.zMax - resumo.zMin)],
  ]
  return (
    <>
      <dl className="tabela-resumo">
        {linhas.map(([k, v, obs]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              {v}
              {obs && <small>{obs}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <h3>Lados</h3>
      <table className="tabela-lados">
        <tbody>
          {terreno.lados.map((l) => (
            <tr key={l.de + l.para}>
              <td>
                {l.de}–{l.para}
              </td>
              <td>{fmt.m(l.m)}</td>
              <td>{l.curva ? 'curva, rodovia' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="nota">
        Divisas vetorizadas da foto aérea do levantamento: os lados conferem com as medidas com erro menor que 10 cm. O relevo
        é calculado a partir de {elevacao.pontos.length} pontos de cota ({nManuais} inseridos por você). Quanto mais pontos
        medidos dentro do lote, mais fiel fica o relevo.
      </p>
    </>
  )
}
