import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { terreno, extensao, fmt } from '../data/terreno'
import { bbox, centroid, dist, type Vec2 } from '../geo/polygon'
import { contours } from '../geo/elevation'
import { useEstado } from '../state/store'
import { useElevacao, useProjeto } from '../state/projeto'

interface Vista { cx: number; cy: number; esc: number } // esc = pixels por metro

const lote = terreno.perimetro
const centro = centroid(lote)
const caixa = bbox(lote)

/** Converte coordenada do mundo (Y para o norte) para o SVG (Y para baixo). */
const s = ([x, y]: Vec2) => `${x},${-y}`
const caminho = (pts: Vec2[], fechado = false) => 'M' + pts.map(s).join('L') + (fechado ? 'Z' : '')

export default function Plan2D() {
  const ref = useRef<SVGSVGElement>(null)
  const [tam, setTam] = useState({ w: 800, h: 600 })
  const [vista, setVista] = useState<Vista | null>(null)
  const camadas = useEstado((e) => e.camadas)
  const intervalo = useEstado((e) => e.intervaloCurvas)
  const setCursor = useEstado((e) => e.setCursor)
  const ferramenta = useEstado((e) => e.ferramenta)
  const setFerramenta = useEstado((e) => e.setFerramenta)
  const setAba = useEstado((e) => e.setAba)
  const elevacao = useElevacao()
  const { cotas, selecionada, selecionar, adicionarCota, editarCota, removerCota, desfazer, marcar } = useProjeto()
  const arrasto = useRef<{ x: number; y: number; cx: number; cy: number; moveu: boolean; cota?: string } | null>(null)

  // Atalhos: Delete apaga a cota selecionada, Cmd+Z desfaz, Esc volta para Selecionar, C = nova cota.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); desfazer() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selecionada) removerCota(selecionada)
      else if (e.key === 'Escape') { setFerramenta('selecionar'); selecionar(null) }
      else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) setFerramenta('cota')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecionada, desfazer, removerCota, setFerramenta, selecionar])

  const enquadrar = useCallback(() => {
    const esc = Math.min(tam.w / (caixa.width * 1.25), tam.h / (caixa.height * 1.25))
    setVista({ cx: caixa.minX + caixa.width / 2, cy: caixa.minY + caixa.height / 2, esc })
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

  const curvas = useMemo(() => {
    const m = 30
    const g = elevacao.grid(caixa.minX - m, caixa.minY - m, caixa.width + 2 * m, caixa.height + 2 * m, 1.5)
    return contours(g, intervalo).map((c) => {
      const mestra = Math.abs(c.level / (intervalo * 5) - Math.round(c.level / (intervalo * 5))) < 1e-6 || Number.isInteger(c.level)
      const d = c.segments.map(([a, b]) => `M${s(a)}L${s(b)}`).join('')
      const meio = c.segments[Math.floor(c.segments.length / 2)]?.[0]
      return { ...c, d, mestra, meio }
    })
  }, [intervalo, elevacao])

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

  const grade = useMemo(() => {
    const linhas: string[] = []
    const e = extensao
    for (let x = Math.ceil(e.minX / 10) * 10; x <= e.maxX; x += 10) linhas.push(`M${x},${-e.minY}V${-e.maxY}`)
    for (let y = Math.ceil(e.minY / 10) * 10; y <= e.maxY; y += 10) linhas.push(`M${e.minX},${-y}H${e.maxX}`)
    return linhas.join('')
  }, [])

  const barra = escalaBarra(v.esc)
  const fonte = 12 * px
  const f = terreno.fotoAerea

  return (
    <div className="plan2d">
      <svg
        ref={ref}
        viewBox={vb.join(' ')}
        className={`ferramenta-${ferramenta}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          const cota = (e.target as Element).getAttribute?.('data-cota') ?? undefined
          if (cota) { selecionar(cota); setAba('cotas'); marcar() }
          arrasto.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moveu: false, cota }
        }}
        onPointerMove={(e) => {
          const [x, y] = paraMundo(e.clientX, e.clientY)
          setCursor({ x, y, z: elevacao.at(x, y) })
          const a = arrasto.current
          if (!a) return
          if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 3) a.moveu = true
          if (!a.moveu) return
          if (a.cota) editarCota(a.cota, { x: round(x), y: round(y) }, false)
          else setVista({ esc: v.esc, cx: a.cx - (e.clientX - a.x) / v.esc, cy: a.cy + (e.clientY - a.y) / v.esc })
        }}
        onPointerUp={(e) => {
          const a = arrasto.current
          arrasto.current = null
          if (!a || a.moveu || a.cota) return
          if (ferramenta === 'cota') {
            const [x, y] = paraMundo(e.clientX, e.clientY)
            adicionarCota(round(x), round(y), round(elevacao.at(x, y)))
            setAba('cotas')
          } else selecionar(null)
        }}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={enquadrar}
      >
        <defs>
          <pattern id="hachura-recuo" width={2} height={2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={2} stroke="#ff9f1c" strokeWidth={0.35} />
          </pattern>
          <pattern id="padrao-mata" width={6} height={6} patternUnits="userSpaceOnUse">
            <circle cx={1.5} cy={1.5} r={0.9} fill="#2f8f46" />
            <circle cx={4.5} cy={4.5} r={0.7} fill="#2f8f46" />
          </pattern>
          <clipPath id="recorte-lote">
            <path d={caminho(lote, true)} />
          </clipPath>
        </defs>

        <rect x={extensao.minX - 500} y={-extensao.maxY - 500} width={extensao.maxX - extensao.minX + 1000} height={extensao.maxY - extensao.minY + 1000} fill="var(--fundo-plano)" />

        {camadas.foto && (
          <image href={f.arquivo} x={f.xMin} y={-f.yMax} width={f.largura} height={f.altura} preserveAspectRatio="none" opacity={0.85} />
        )}

        {camadas.grade && <path d={grade} stroke="var(--grade)" strokeWidth={px} fill="none" />}

        {camadas.mata && (
          <path d={caminho(terreno.mata.poligono, true)} fill="url(#padrao-mata)" fillOpacity={camadas.foto ? 0.35 : 0.8} stroke="#2f8f46" strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
        )}

        {camadas.recuo && (
          <g>
            <path d={caminho(terreno.recuo.poligono, true)} fill="url(#hachura-recuo)" stroke="none" />
            <path d={caminho(terreno.recuo.poligono, true)} fill="#ff9f1c" fillOpacity={0.12} stroke="none" />
          </g>
        )}

        {camadas.curvas && (
          <g clipPath="url(#recorte-lote)">
            {curvas.map((c) => (
              <path key={c.level} d={c.d} stroke={c.mestra ? 'var(--curva-mestra)' : 'var(--curva)'} strokeWidth={(c.mestra ? 1.4 : 0.8) * px} fill="none" />
            ))}
            {curvas.filter((c) => c.mestra && c.meio).map((c) => (
              <text key={'t' + c.level} x={c.meio![0]} y={-c.meio![1]} fontSize={fonte * 0.85} className="rotulo-curva">
                {c.level.toFixed(c.level % 1 ? 1 : 0)}
              </text>
            ))}
          </g>
        )}

        {camadas.perimetro && (
          <g>
            <path d={caminho(lote, true)} fill="none" stroke="#e63946" strokeWidth={2.5 * px} strokeLinejoin="round" />
            {Object.entries(terreno.vertices).map(([nome, p]) => {
              const dir = norm([p[0] - centro[0], p[1] - centro[1]])
              return (
                <g key={nome}>
                  <circle cx={p[0]} cy={-p[1]} r={4 * px} fill="#fff" stroke="#e63946" strokeWidth={2 * px} />
                  <text x={p[0] + dir[0] * 14 * px} y={-(p[1] + dir[1] * 14 * px)} fontSize={fonte * 1.1} className="rotulo-vertice">
                    {nome}
                  </text>
                </g>
              )
            })}
          </g>
        )}

        {camadas.medidas &&
          medidas.map((m) => {
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

        {(camadas.cotas || ferramenta === 'cota') &&
          cotas.map((c) => {
            const sel = c.id === selecionada
            const cor = c.origem === 'manual' ? '#5ce1e6' : '#ffd166'
            return (
              <g key={c.id} className="marcador-cota">
                {sel && <circle cx={c.x} cy={-c.y} r={9 * px} fill="none" stroke="#fff" strokeWidth={2 * px} />}
                <path d={`M${c.x - 4 * px},${-c.y}h${8 * px}M${c.x},${-c.y - 4 * px}v${8 * px}`} stroke={cor} strokeWidth={1.8 * px} />
                <text x={c.x + 6 * px} y={-c.y - 5 * px} fontSize={fonte * (sel ? 1 : 0.85)} className="rotulo-cota" style={{ fill: cor }}>
                  {c.z.toFixed(2)}
                </text>
                <circle data-cota={c.id} cx={c.x} cy={-c.y} r={8 * px} fill="transparent" className="alvo-cota">
                  <title>{`${c.id}: cota ${c.z.toFixed(3)} m (arraste para mover)`}</title>
                </circle>
              </g>
            )
          })}
      </svg>

      <div className="ferramentas" role="toolbar" aria-label="Ferramentas">
        <button className={ferramenta === 'selecionar' ? 'ativa' : ''} onClick={() => setFerramenta('selecionar')} title="Selecionar e mover (Esc)">
          ↖ Selecionar
        </button>
        <button className={ferramenta === 'cota' ? 'ativa' : ''} onClick={() => setFerramenta('cota')} title="Clique na planta para criar um ponto de cota (C)">
          ⌖ Nova cota
        </button>
      </div>
      {ferramenta === 'cota' && (
        <div className="dica-ferramenta">Clique onde você mediu o nível. Depois digite a cota no painel à direita. Esc para sair.</div>
      )}

      <div className="plan2d-sobre">
        <div className="norte" title="Norte">
          <svg viewBox="-12 -16 24 30" width={24} height={30}>
            <path d="M0,-14 L7,8 L0,3 L-7,8 Z" fill="currentColor" />
          </svg>
          <span>N</span>
        </div>
        <div className="barra-escala">
          <div style={{ width: barra.m * v.esc }} />
          <span>{barra.m} m</span>
        </div>
        <button className="botao-pequeno" onClick={enquadrar} title="Enquadrar o lote (ou dê dois cliques)">
          Enquadrar
        </button>
      </div>
    </div>
  )
}

const round = (v: number) => Math.round(v * 1000) / 1000

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
  const m = opcoes.find((o) => o >= alvo * 0.6) ?? 500
  return { m }
}
