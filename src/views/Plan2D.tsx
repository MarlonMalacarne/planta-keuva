import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { terreno, extensao, fmt } from '../data/terreno'
import { bbox, centroid, dist, type Vec2 } from '../geo/polygon'
import { contours } from '../geo/elevation'
import { useEstado } from '../state/store'
import { useElevacao, useProjeto } from '../state/projeto'
import { contorno, type Elemento } from '../model/elementos'

interface Vista { cx: number; cy: number; esc: number } // esc = pixels por metro

const lote = terreno.perimetro
const centro = centroid(lote)
const caixa = bbox(lote)
const COR_SELECAO = '#5b8cff'

/** Converte coordenada do mundo (Y para o norte) para o SVG (Y para baixo). */
const s = ([x, y]: Vec2) => `${x},${-y}`
const caminho = (pts: Vec2[], fechado = false) => 'M' + pts.map(s).join('L') + (fechado ? 'Z' : '')
const arred = (v: number) => Math.round(v * 1000) / 1000

type Arrasto = { x: number; y: number; cx: number; cy: number; moveu: boolean; alvo?: { tipo: 'cota' | 'elemento'; id: string; dx: number; dy: number } }

export default function Plan2D() {
  const ref = useRef<SVGSVGElement>(null)
  const [tam, setTam] = useState({ w: 800, h: 600 })
  const [vista, setVista] = useState<Vista | null>(null)
  const camadas = useEstado((e) => e.camadas)
  const intervalo = useEstado((e) => e.intervaloCurvas)
  const setCursor = useEstado((e) => e.setCursor)
  const ferramenta = useEstado((e) => e.ferramenta)
  const elevacao = useElevacao()
  const { cotas, elementos, selecao, selecionar, adicionarCota, editarCota, editarElemento, marcar } = useProjeto()
  const arrasto = useRef<Arrasto | null>(null)

  // Enquadra o lote no espaço entre os painéis (esquerdo ~272 px, direito ~304 px).
  const enquadrar = useCallback(() => {
    const esq = tam.w > 900 ? 272 : 0, dir = tam.w > 900 ? 304 : 0
    const livre = tam.w - esq - dir
    const esc = Math.min(livre / (caixa.width * 1.15), (tam.h - 120) / (caixa.height * 1.15))
    const deslocamento = (esq - dir) / 2 / esc
    setVista({ cx: caixa.minX + caixa.width / 2 - deslocamento, cy: caixa.minY + caixa.height / 2, esc })
  }, [tam])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!vista && tam.w > 0) enquadrar()
  }, [tam, vista, enquadrar])

  const v = vista ?? { cx: centro[0], cy: centro[1], esc: 3 }
  const vb = [v.cx - tam.w / 2 / v.esc, -v.cy - tam.h / 2 / v.esc, tam.w / v.esc, tam.h / v.esc]
  const px = 1 / v.esc // 1 pixel de tela em metros

  const paraMundo = (cx: number, cy: number): Vec2 => {
    const r = ref.current!.getBoundingClientRect()
    return [v.cx + (cx - r.left - tam.w / 2) / v.esc, v.cy - (cy - r.top - tam.h / 2) / v.esc]
  }

  // Zoom com a roda do mouse / pinça do trackpad, centrado no cursor.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setVista((atual) => {
        const a = atual ?? v
        const r = el.getBoundingClientRect()
        const mx = a.cx + (e.clientX - r.left - tam.w / 2) / a.esc
        const my = a.cy - (e.clientY - r.top - tam.h / 2) / a.esc
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
        const esc = Math.min(200, Math.max(0.5, a.esc * f))
        return { esc, cx: mx - (mx - a.cx) * (a.esc / esc), cy: my - (my - a.cy) * (a.esc / esc) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const mostrarRelevo = camadas.relevo || ferramenta === 'cota'

  const curvas = useMemo(() => {
    if (!mostrarRelevo) return []
    const m = 30
    const g = elevacao.grid(caixa.minX - m, caixa.minY - m, caixa.width + 2 * m, caixa.height + 2 * m, 1.5)
    return contours(g, intervalo).map((c) => {
      const mestra = Number.isInteger(c.level)
      const d = c.segments.map(([a, b]) => `M${s(a)}L${s(b)}`).join('')
      const meio = c.segments[Math.floor(c.segments.length / 2)]?.[0]
      return { ...c, d, mestra, meio }
    })
  }, [intervalo, elevacao, mostrarRelevo])

  const medidas = useMemo(() => {
    const vt = terreno.vertices
    return terreno.lados.map((l) => {
      if (l.curva) {
        const pts = terreno.divisaRodovia
        const i = Math.floor(pts.length / 2)
        const a = pts[i - 1], b = pts[i + 1], m = pts[i]
        return { ...l, pos: m, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), normal: normal(a, b, m) }
      }
      const a = vt[l.de], b = vt[l.para]
      const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      return { ...l, pos: m, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), normal: normal(a, b, m) }
    })
  }, [])

  const barra = escalaBarra(v.esc)
  const fonte = 12 * px
  const f = terreno.fotoAerea
  const selCota = selecao?.tipo === 'cota' ? selecao.id : null
  const selElem = selecao?.tipo === 'elemento' ? selecao.id : null

  return (
    <div className="plan2d">
      <svg
        ref={ref}
        viewBox={vb.join(' ')}
        className={`ferramenta-${ferramenta}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          const t = e.target as Element
          const cota = t.getAttribute?.('data-cota')
          const elem = t.closest?.('[data-elemento]')?.getAttribute('data-elemento')
          let alvo: Arrasto['alvo']
          const [mx, my] = paraMundo(e.clientX, e.clientY)
          if (cota && ferramenta !== 'cota') {
            const c = cotas.find((c) => c.id === cota)!
            alvo = { tipo: 'cota', id: cota, dx: c.x - mx, dy: c.y - my }
          } else if (elem && ferramenta !== 'cota') {
            const el = elementos.find((x) => x.id === elem)!
            alvo = { tipo: 'elemento', id: elem, dx: el.x - mx, dy: el.y - my }
          }
          if (alvo) {
            selecionar({ tipo: alvo.tipo, id: alvo.id })
            marcar()
          }
          arrasto.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moveu: false, alvo }
        }}
        onPointerMove={(e) => {
          const [x, y] = paraMundo(e.clientX, e.clientY)
          setCursor({ x, y, z: elevacao.at(x, y) })
          const a = arrasto.current
          if (!a) return
          if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 3) a.moveu = true
          if (!a.moveu) return
          if (a.alvo?.tipo === 'cota') editarCota(a.alvo.id, { x: arred(x + a.alvo.dx), y: arred(y + a.alvo.dy) }, false)
          else if (a.alvo?.tipo === 'elemento') {
            // Move em passos de 0,5 m, como no 3D.
            const passo = (n: number) => Math.round(n * 2) / 2
            editarElemento(a.alvo.id, { x: passo(x + a.alvo.dx), y: passo(y + a.alvo.dy) }, false)
          } else setVista({ esc: v.esc, cx: a.cx - (e.clientX - a.x) / v.esc, cy: a.cy + (e.clientY - a.y) / v.esc })
        }}
        onPointerUp={(e) => {
          const a = arrasto.current
          arrasto.current = null
          if (!a || a.moveu || a.alvo) return
          if (ferramenta === 'cota') {
            const [x, y] = paraMundo(e.clientX, e.clientY)
            adicionarCota(arred(x), arred(y), arred(elevacao.at(x, y)))
          } else selecionar(null)
        }}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={enquadrar}
      >
        <defs>
          <pattern id="hachura-recuo" width={2} height={2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={2} stroke="#ffb020" strokeWidth={0.35} />
          </pattern>
          <pattern id="padrao-mata" width={6} height={6} patternUnits="userSpaceOnUse">
            <circle cx={1.5} cy={1.5} r={0.9} fill="#3fa35b" />
            <circle cx={4.5} cy={4.5} r={0.7} fill="#3fa35b" />
          </pattern>
          <clipPath id="recorte-lote">
            <path d={caminho(lote, true)} />
          </clipPath>
        </defs>

        <rect x={extensao.minX - 500} y={-extensao.maxY - 500} width={extensao.maxX - extensao.minX + 1000} height={extensao.maxY - extensao.minY + 1000} fill="var(--fundo-plano)" />

        {camadas.foto && <image href={f.arquivo} x={f.xMin} y={-f.yMax} width={f.largura} height={f.altura} preserveAspectRatio="none" opacity={0.8} />}

        {camadas.mata && (
          <path d={caminho(terreno.mata.poligono, true)} fill="url(#padrao-mata)" fillOpacity={camadas.foto ? 0.35 : 0.8} stroke="#3fa35b" strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
        )}

        {camadas.recuo && (
          <g>
            <path d={caminho(terreno.recuo.poligono, true)} fill="url(#hachura-recuo)" />
            <path d={caminho(terreno.recuo.poligono, true)} fill="#ffb020" fillOpacity={0.12} />
          </g>
        )}

        {mostrarRelevo && (
          <g clipPath="url(#recorte-lote)">
            {curvas.map((c) => (
              <path key={c.level} d={c.d} stroke={c.mestra ? 'var(--curva-mestra)' : 'var(--curva)'} strokeWidth={(c.mestra ? 1.4 : 0.8) * px} fill="none" />
            ))}
            {curvas.filter((c) => c.mestra && c.meio).map((c) => (
              <text key={'t' + c.level} x={c.meio![0]} y={-c.meio![1]} fontSize={fonte * 0.85} className="rotulo-curva">
                {c.level.toFixed(0)}
              </text>
            ))}
          </g>
        )}

        {camadas.divisas && (
          <g>
            <path d={caminho(lote, true)} fill="none" stroke="#ff5a5f" strokeWidth={2.5 * px} strokeLinejoin="round" />
            {Object.entries(terreno.vertices).map(([nome, p]) => {
              const dir = norm([p[0] - centro[0], p[1] - centro[1]])
              return (
                <g key={nome}>
                  <circle cx={p[0]} cy={-p[1]} r={4 * px} fill="#fff" stroke="#ff5a5f" strokeWidth={2 * px} />
                  <text x={p[0] + dir[0] * 14 * px} y={-(p[1] + dir[1] * 14 * px)} fontSize={fonte * 1.1} className="rotulo-vertice">
                    {nome}
                  </text>
                </g>
              )
            })}
            {medidas.map((m) => {
              let ang = (-m.ang * 180) / Math.PI
              if (ang > 90) ang -= 180
              if (ang < -90) ang += 180
              const off = 16 * px
              const x = m.pos[0] + m.normal[0] * off
              const y = -(m.pos[1] + m.normal[1] * off)
              return (
                <text key={m.de + m.para} x={x} y={y} fontSize={fonte * 1.05} transform={`rotate(${ang} ${x} ${y})`} className="rotulo-medida">
                  {fmt.m(m.m)}
                </text>
              )
            })}
          </g>
        )}

        {elementos.map((e) => (
          <Pegada key={e.id} e={e} px={px} fonte={fonte} selecionado={e.id === selElem} />
        ))}

        {mostrarRelevo &&
          cotas.map((c) => {
            const sel = c.id === selCota
            const cor = c.origem === 'manual' ? '#5ce1e6' : '#ffd166'
            return (
              <g key={c.id}>
                {sel && <circle cx={c.x} cy={-c.y} r={9 * px} fill="none" stroke="#fff" strokeWidth={2 * px} />}
                <path d={`M${c.x - 4 * px},${-c.y}h${8 * px}M${c.x},${-c.y - 4 * px}v${8 * px}`} stroke={cor} strokeWidth={1.8 * px} />
                <text x={c.x + 6 * px} y={-c.y - 5 * px} fontSize={fonte * (sel ? 1 : 0.85)} className="rotulo-cota" style={{ fill: cor }}>
                  {c.z.toFixed(2)}
                </text>
                <circle data-cota={c.id} cx={c.x} cy={-c.y} r={8 * px} fill="transparent" className="alvo-arrastavel">
                  <title>{`${c.id}: cota ${c.z.toFixed(3)} m`}</title>
                </circle>
              </g>
            )
          })}
      </svg>

      <div className="plan2d-sobre">
        <div className="norte" title="Norte">
          <svg viewBox="-12 -16 24 30" width={20} height={26}>
            <path d="M0,-14 L7,8 L0,3 L-7,8 Z" fill="currentColor" />
          </svg>
          <span>N</span>
        </div>
        <div className="barra-escala">
          <div style={{ width: barra * v.esc }} />
          <span>{barra} m</span>
        </div>
        <button className="botao-flutuante" onClick={enquadrar} title="Enquadrar o lote (ou dê dois cliques)">
          Enquadrar
        </button>
      </div>
    </div>
  )
}

/** Projeção do elemento em planta, com nome e medidas. */
function Pegada({ e, px, fonte, selecionado }: { e: Elemento; px: number; fonte: number; selecionado: boolean }) {
  const cor = selecionado ? COR_SELECAO : '#ffffff'
  const forma =
    e.tipo === 'tanque' ? (
      <circle cx={e.x} cy={-e.y} r={e.largura / 2} />
    ) : (
      <path d={caminho(contorno(e), true)} />
    )
  return (
    <g data-elemento={e.id} className="alvo-arrastavel">
      <g fill={e.cor} fillOpacity={0.85} stroke={cor} strokeWidth={(selecionado ? 2.5 : 1.2) * px}>
        {forma}
      </g>
      <text x={e.x} y={-e.y - fonte * 0.4} fontSize={fonte} className="rotulo-elemento">
        {e.nome}
      </text>
      <text x={e.x} y={-e.y + fonte * 0.9} fontSize={fonte * 0.85} className="rotulo-elemento-medida">
        {e.tipo === 'tanque' ? `Ø ${fmt.m(e.largura, 1)}` : `${fmt.m(e.largura, 1)} × ${fmt.m(e.comprimento, 1)}`}
      </text>
    </g>
  )
}

function norm([x, y]: Vec2): Vec2 {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

/** Normal do segmento a→b apontando para fora do lote. */
function normal(a: Vec2, b: Vec2, m: Vec2): Vec2 {
  const n = norm([b[1] - a[1], -(b[0] - a[0])])
  const fora = dist([m[0] + n[0], m[1] + n[1]], centro) > dist(m, centro)
  return fora ? n : [-n[0], -n[1]]
}

function escalaBarra(esc: number) {
  const alvo = 120 / esc
  const opcoes = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
  return opcoes.find((o) => o >= alvo * 0.6) ?? 500
}
