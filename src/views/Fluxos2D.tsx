import type { Vec2 } from '../geo/polygon'
import { setasDoFluxo, type Fluxo } from '../model/fluxos'

const s = ([x, y]: Vec2) => `${x},${-y}`
const COR_SELECAO = '#5b8cff'

/** Caminho com setas na planta. As setas ficam com o mesmo tamanho na tela em qualquer zoom. */
export function FluxoNaPlanta({ f, px, fonte, selecionado }: { f: Fluxo; px: number; fonte: number; selecionado: boolean }) {
  const d = 'M' + f.pontos.map(s).join('L')
  const tam = 5.5 * px
  const setas = setasDoFluxo(f.pontos, Math.max(10, 150 * px))
  const meio = setas[0]
  return (
    <g data-fluxo={f.id} className="fluxo alvo-arrastavel">
      {/* Faixa larga e invisível: fica fácil de pegar o caminho com o mouse */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12 * px} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="rgba(10,14,22,0.35)" strokeWidth={(selecionado ? 5.5 : 3.4) * px} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      <path d={d} fill="none" stroke={selecionado ? COR_SELECAO : f.cor} strokeWidth={(selecionado ? 3.2 : 1.7) * px} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" strokeOpacity={selecionado ? 1 : 0.92} />
      {setas.map(({ p, ang }, i) => {
        const c = Math.cos(ang), sn = Math.sin(ang)
        const ponta: Vec2 = [p[0] + c * tam, p[1] + sn * tam]
        const b1: Vec2 = [p[0] - c * tam * 0.6 - sn * tam * 0.75, p[1] - sn * tam * 0.6 + c * tam * 0.75]
        const b2: Vec2 = [p[0] - c * tam * 0.6 + sn * tam * 0.75, p[1] - sn * tam * 0.6 - c * tam * 0.75]
        return <path key={i} d={`M${s(ponta)}L${s(b1)}L${s(b2)}Z`} fill={selecionado ? COR_SELECAO : f.cor} stroke="rgba(10,14,22,0.5)" strokeWidth={0.8 * px} pointerEvents="none" />
      })}
      {selecionado && meio && (
        <text x={meio.p[0]} y={-meio.p[1] - 9 * px} fontSize={fonte * 0.95} className="rotulo-fluxo">
          {f.nome}
        </text>
      )}
      {selecionado && f.pontos.map(([x, y], i) => <circle key={i} data-vertice-fluxo={i} cx={x} cy={-y} r={4 * px} className="vertice-piso" strokeWidth={1.5 * px} />)}
    </g>
  )
}
