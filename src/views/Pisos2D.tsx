import { area, bbox, centroid, type Vec2 } from '../geo/polygon'
import { fmt } from '../data/terreno'
import { materiais, type MaterialPiso, type Piso } from '../model/pisos'

const s = ([x, y]: Vec2) => `${x},${-y}`
const caminho = (pts: Vec2[], fechado = false) => 'M' + pts.map(s).join('L') + (fechado ? 'Z' : '')
const COR_SELECAO = '#5b8cff'

/** Texturas da planta, em metros (o tamanho acompanha o zoom). */
export function PadroesPiso() {
  const m = materiais
  return (
    <>
      <pattern id="piso-asfalto" width={1.6} height={1.6} patternUnits="userSpaceOnUse">
        <rect width={1.6} height={1.6} fill={m.asfalto.cor} />
        {[[0.2, 0.3], [0.9, 0.15], [1.3, 0.8], [0.5, 1.1], [1.1, 1.4], [0.15, 0.95]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.05} fill={i % 2 ? '#56595f' : '#2c2f34'} />
        ))}
      </pattern>
      <pattern id="piso-cascalho" width={1} height={1} patternUnits="userSpaceOnUse">
        <rect width={1} height={1} fill={m.cascalho.cor} />
        {[[0.15, 0.2, 0.13], [0.55, 0.1, 0.1], [0.85, 0.45, 0.14], [0.35, 0.55, 0.12], [0.7, 0.85, 0.11], [0.1, 0.8, 0.1]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={['#c2b9a7', '#8b8273', '#b3a994'][i % 3]} />
        ))}
      </pattern>
      <pattern id="piso-concreto" width={3} height={3} patternUnits="userSpaceOnUse">
        <rect width={3} height={3} fill={m.concreto.cor} />
        <path d="M0,0H3M0,0V3" stroke="#9d9a93" strokeWidth={0.06} />
      </pattern>
      <pattern id="piso-bloquete" width={1.2} height={0.6} patternUnits="userSpaceOnUse">
        <rect width={1.2} height={0.6} fill={m.bloquete.cor} />
        <path d="M0,0H1.2M0,0.3H1.2M0.3,0V0.3M0.9,0V0.3M0.6,0.3V0.6M0,0.3V0.6" stroke="#7d5241" strokeWidth={0.04} />
      </pattern>
      <pattern id="piso-grama" width={1.2} height={1.2} patternUnits="userSpaceOnUse">
        <rect width={1.2} height={1.2} fill={m.grama.cor} />
        <path d="M0.2,0.4l0.06,-0.22M0.7,0.3l-0.05,-0.2M1,0.9l0.05,-0.22M0.4,1.05l-0.06,-0.2M0.9,0.55l0.04,-0.2" stroke="#477a35" strokeWidth={0.05} strokeLinecap="round" />
        <path d="M0.5,0.7l0.05,-0.2M0.1,1l0.04,-0.18" stroke="#78b45d" strokeWidth={0.05} strokeLinecap="round" />
      </pattern>
      <pattern id="piso-terra" width={2} height={2} patternUnits="userSpaceOnUse">
        <rect width={2} height={2} fill={m.terra.cor} />
        {[[0.3, 0.4, 0.12], [1.4, 0.3, 0.09], [0.9, 1.2, 0.14], [1.7, 1.6, 0.1], [0.4, 1.7, 0.08]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#a07d58' : '#745838'} />
        ))}
      </pattern>
    </>
  )
}

export function PisoNaPlanta({ p, px, fonte, selecionado }: { p: Piso; px: number; fonte: number; selecionado: boolean }) {
  const b = bbox(p.pontos)
  const [cx, cy] = centroid(p.pontos)
  const cabe = Math.min(b.width, b.height) / px > 46
  return (
    <g data-piso={p.id} className="alvo-arrastavel">
      <path d={caminho(p.pontos, true)} fill={`url(#piso-${p.material})`} fillOpacity={0.94} stroke={selecionado ? COR_SELECAO : 'rgba(255,255,255,0.6)'} strokeWidth={(selecionado ? 2.5 : 1) * px} strokeLinejoin="round" />
      {cabe && (
        <g className="rotulo-piso">
          <text x={cx} y={-cy - fonte * 0.45} fontSize={fonte * 0.95}>
            {p.nome}
          </text>
          <text x={cx} y={-cy + fonte * 0.75} fontSize={fonte * 0.8} className="medida">
            {fmt.m2(area(p.pontos))}
          </text>
        </g>
      )}
      {selecionado &&
        p.pontos.map(([x, y], i) => <circle key={i} data-vertice={i} cx={x} cy={-y} r={5 * px} className="vertice-piso" strokeWidth={1.5 * px} />)}
    </g>
  )
}

/** O piso que está sendo desenhado: cantos marcados e a linha até o mouse. */
export function RascunhoPiso({ pontos, mouse, material, px, fonte }: { pontos: Vec2[]; mouse: Vec2 | null; material: MaterialPiso; px: number; fonte: number }) {
  if (!pontos.length) return null
  const comMouse = mouse ? [...pontos, mouse] : pontos
  const m2 = comMouse.length >= 3 ? area(comMouse) : 0
  const [cx, cy] = comMouse.length >= 3 ? centroid(comMouse) : comMouse[comMouse.length - 1]
  return (
    <g className="rascunho-piso" pointerEvents="none">
      {comMouse.length >= 3 && <path d={caminho(comMouse, true)} fill={`url(#piso-${material})`} fillOpacity={0.6} />}
      <path d={caminho(comMouse)} fill="none" stroke="#fff" strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
      {pontos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={-y} r={(i === 0 && pontos.length >= 3 ? 7 : 4.5) * px} fill={i === 0 ? '#5b8cff' : '#fff'} stroke="#1b2333" strokeWidth={1.5 * px} />
      ))}
      {m2 > 0 && (
        <text x={cx} y={-cy} fontSize={fonte} className="rotulo-rascunho">
          {fmt.m2(m2)}
        </text>
      )}
    </g>
  )
}
