import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { areasProtegidas, terreno, extensao, fmt } from '../data/terreno'
import { bbox, centroid, contains, dist, type Vec2 } from '../geo/polygon'
import { contours } from '../geo/elevation'
import { useEstado } from '../state/store'
import { useElevacao, useProjeto } from '../state/projeto'
import { anguloEm, contorno, difAngulo, direcaoLado, esticar, finoComoMuro, girar, type Elemento, type Lado } from '../model/elementos'
import type { Arvore } from '../model/arvores'
import { areaInvadida } from '../model/protecao'
import { retangulo } from '../model/pisos'
import { concluirPiso, encaixar, marcarCanto } from '../state/desenho'
import { PadroesPiso, PisoNaPlanta, RascunhoPiso, RotuloPiso } from './Pisos2D'
import { FluxoNaPlanta } from './Fluxos2D'

interface Vista { cx: number; cy: number; esc: number } // esc = pixels por metro

const lote = terreno.perimetro
const centro = centroid(lote)
const caixa = bbox(lote)
const COR_SELECAO = '#5b8cff'

/** Converte coordenada do mundo (Y para o norte) para o SVG (Y para baixo). */
const s = ([x, y]: Vec2) => `${x},${-y}`
const caminho = (pts: Vec2[], fechado = false) => 'M' + pts.map(s).join('L') + (fechado ? 'Z' : '')
const arred = (v: number) => Math.round(v * 1000) / 1000

type Alvo =
  | { tipo: 'cota' | 'elemento'; id: string; dx: number; dy: number }
  | { tipo: 'arvores'; originais: Arvore[]; x0: number; y0: number }
  | { tipo: 'face'; e0: Elemento; lado: Lado; x0: number; y0: number }
  | { tipo: 'giro'; e0: Elemento; ultimo: number; varrido: number }
  | { tipo: 'caixa'; x0: number; y0: number; somar: string[] }
  | { tipo: 'piso'; id: string; originais: Vec2[]; x0: number; y0: number }
  | { tipo: 'vertice'; id: string; i: number }
  | { tipo: 'fluxo'; id: string; originais: Vec2[]; x0: number; y0: number }
  | { tipo: 'verticeFluxo'; id: string; i: number }
  | { tipo: 'retangulo'; x0: number; y0: number }
  | { tipo: 'nada' }
type Arrasto = { x: number; y: number; cx: number; cy: number; moveu: boolean; marcado: boolean; alvo?: Alvo }
const LADOS: Lado[] = ['x+', 'x-', 'y+', 'y-']
const metros = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m'
const noPasso = (v: number, passo: number) => Math.round(v / passo) * passo

export default function Plan2D() {
  const ref = useRef<SVGSVGElement>(null)
  const [tam, setTam] = useState({ w: 800, h: 600 })
  const [vista, setVista] = useState<Vista | null>(null)
  const camadas = useEstado((e) => e.camadas)
  const intervalo = useEstado((e) => e.intervaloCurvas)
  const setCursor = useEstado((e) => e.setCursor)
  const ferramenta = useEstado((e) => e.ferramenta)
  const elevacao = useElevacao()
  const { cotas, elementos, arvores, pisos, fluxos, selecao, selecionar, adicionarCota, editarCota, editarElemento, editarArvores, editarPiso, editarFluxo, marcar } = useProjeto()
  const rascunho = useEstado((e) => e.rascunho)
  const materialPiso = useEstado((e) => e.materialPiso)
  const [mouse, setMouse] = useState<Vec2 | null>(null)
  const arrasto = useRef<Arrasto | null>(null)
  const [caixaSel, setCaixaSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [etiqueta, setEtiqueta] = useState<{ texto: string; x: number; y: number } | null>(null)

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
  const elemSel = selElem ? elementos.find((e) => e.id === selElem) : undefined
  const arvSel = useMemo(() => new Set(selecao?.tipo === 'arvores' ? selecao.ids : []), [selecao])
  const selPiso = selecao?.tipo === 'piso' ? selecao.id : null
  const selFluxo = selecao?.tipo === 'fluxo' ? selecao.id : null

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
          const arv = t.getAttribute?.('data-arvore')
          const alca = t.closest?.('[data-alca]')?.getAttribute('data-alca')
          const elem = t.closest?.('[data-elemento]')?.getAttribute('data-elemento')
          const piso = t.closest?.('[data-piso]')?.getAttribute('data-piso')
          const vertice = t.getAttribute?.('data-vertice')
          const fluxo = t.closest?.('[data-fluxo]')?.getAttribute('data-fluxo')
          const verticeFluxo = t.getAttribute?.('data-vertice-fluxo')
          let alvo: Alvo | undefined
          const [mx, my] = paraMundo(e.clientX, e.clientY)
          if (ferramenta === 'piso') {
            // Pintando o chão: clique marca canto (no soltar), Shift + arraste faz um retângulo.
            if (e.shiftKey) alvo = { tipo: 'retangulo', x0: mx, y0: my }
          } else if (ferramenta !== 'cota') {
            if (alca && elemSel) {
              alvo = alca === 'giro' ? { tipo: 'giro', e0: elemSel, ultimo: anguloEm(elemSel, [mx, my]), varrido: 0 } : { tipo: 'face', e0: elemSel, lado: alca as Lado, x0: mx, y0: my }
            } else if (cota) {
              const c = cotas.find((c) => c.id === cota)!
              alvo = { tipo: 'cota', id: cota, dx: c.x - mx, dy: c.y - my }
              selecionar({ tipo: 'cota', id: cota })
            } else if (fluxo && verticeFluxo !== null && verticeFluxo !== undefined) {
              const ff = fluxos.find((x) => x.id === fluxo)!
              if (e.altKey && ff.pontos.length > 2) {
                // Option + clique tira o ponto do caminho.
                editarFluxo(fluxo, { pontos: ff.pontos.filter((_, i) => i !== Number(verticeFluxo)) })
                alvo = { tipo: 'nada' }
              } else alvo = { tipo: 'verticeFluxo', id: fluxo, i: Number(verticeFluxo) }
            } else if (fluxo && !e.shiftKey) {
              const ff = fluxos.find((x) => x.id === fluxo)!
              selecionar({ tipo: 'fluxo', id: fluxo })
              alvo = { tipo: 'fluxo', id: fluxo, originais: ff.pontos, x0: mx, y0: my }
            } else if (elem) {
              const el = elementos.find((x) => x.id === elem)!
              alvo = { tipo: 'elemento', id: elem, dx: el.x - mx, dy: el.y - my }
              selecionar({ tipo: 'elemento', id: elem })
            } else if (vertice !== null && vertice !== undefined && piso) {
              const pp = pisos.find((x) => x.id === piso)!
              if (e.altKey && pp.pontos.length > 3) {
                // Option + clique tira o canto.
                editarPiso(piso, { pontos: pp.pontos.filter((_, i) => i !== Number(vertice)) })
                alvo = { tipo: 'nada' }
              } else alvo = { tipo: 'vertice', id: piso, i: Number(vertice) }
            } else if (arv) {
              const atuais = selecao?.tipo === 'arvores' ? selecao.ids : []
              if (e.shiftKey) {
                // Shift + clique soma ou tira a árvore da seleção.
                const ids = atuais.includes(arv) ? atuais.filter((id) => id !== arv) : [...atuais, arv]
                selecionar(ids.length ? { tipo: 'arvores', ids } : null)
                alvo = { tipo: 'nada' }
              } else {
                const ids = atuais.includes(arv) ? atuais : [arv]
                if (ids !== atuais) selecionar({ tipo: 'arvores', ids })
                const set = new Set(ids)
                alvo = { tipo: 'arvores', originais: arvores.filter((a) => set.has(a.id)), x0: mx, y0: my }
              }
            } else if (piso && !e.shiftKey) {
              const pp = pisos.find((x) => x.id === piso)!
              selecionar({ tipo: 'piso', id: piso })
              alvo = { tipo: 'piso', id: piso, originais: pp.pontos, x0: mx, y0: my }
            } else if (e.shiftKey) {
              alvo = { tipo: 'caixa', x0: mx, y0: my, somar: selecao?.tipo === 'arvores' ? selecao.ids : [] }
            }
          }
          arrasto.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moveu: false, marcado: false, alvo }
        }}
        onPointerMove={(e) => {
          const [x, y] = paraMundo(e.clientX, e.clientY)
          setCursor({ x, y, z: elevacao.at(x, y) })
          if (ferramenta === 'piso') setMouse(rascunho.length ? encaixar([x, y], 10 * px) : null)
          const a = arrasto.current
          if (!a) return
          if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 3) a.moveu = true
          if (!a.moveu) return
          const alvo = a.alvo
          const edita = alvo && alvo.tipo !== 'caixa' && alvo.tipo !== 'nada' && alvo.tipo !== 'retangulo'
          if (edita && !a.marcado) {
            marcar()
            a.marcado = true
          }
          const fino = e.shiftKey
          if (!alvo) setVista({ esc: v.esc, cx: a.cx - (e.clientX - a.x) / v.esc, cy: a.cy + (e.clientY - a.y) / v.esc })
          else if (alvo.tipo === 'cota') editarCota(alvo.id, { x: arred(x + alvo.dx), y: arred(y + alvo.dy) }, false)
          else if (alvo.tipo === 'elemento') {
            const passo = fino ? 0.05 : 0.5
            editarElemento(alvo.id, { x: arred(noPasso(x + alvo.dx, passo)), y: arred(noPasso(y + alvo.dy, passo)) }, false)
          } else if (alvo.tipo === 'arvores') {
            const passo = fino ? 0.05 : 0.5
            const dx = noPasso(x - alvo.x0, passo), dy = noPasso(y - alvo.y0, passo)
            editarArvores(Object.fromEntries(alvo.originais.map((o) => [o.id, { x: arred(o.x + dx), y: arred(o.y + dy) }])), false)
          } else if (alvo.tipo === 'face') {
            const dir = direcaoLado(alvo.e0, alvo.lado)
            const d = (x - alvo.x0) * dir[0] + (y - alvo.y0) * dir[1]
            const novo = { ...alvo.e0, ...esticar(alvo.e0, alvo.lado, d, fino ? 0.05 : 0.5) }
            editarElemento(alvo.e0.id, novo, false)
            const [hx, hy] = pontoLado(novo, alvo.lado, 26 * px)
            setEtiqueta({ texto: rotuloLado(novo, alvo.lado), x: hx, y: hy })
          } else if (alvo.tipo === 'giro') {
            const ang = anguloEm(alvo.e0, [x, y])
            alvo.varrido += difAngulo(alvo.ultimo, ang)
            alvo.ultimo = ang
            const novo = girar(alvo.e0, alvo.varrido, fino ? 1 : 5)
            editarElemento(alvo.e0.id, novo, false)
            setEtiqueta({ texto: `Giro ${(novo.rot ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}°`, x: x + 14 * px, y: y + 14 * px })
          } else if (alvo.tipo === 'piso') {
            const passo = fino ? 0.05 : 0.5
            const dx = noPasso(x - alvo.x0, passo), dy = noPasso(y - alvo.y0, passo)
            editarPiso(alvo.id, { pontos: alvo.originais.map(([px0, py0]) => [arred(px0 + dx), arred(py0 + dy)] as Vec2) }, false)
          } else if (alvo.tipo === 'vertice') {
            const pp = pisos.find((p) => p.id === alvo.id)
            if (!pp) return
            const q = fino ? ([arred(x), arred(y)] as Vec2) : encaixarSem(pp.pontos, [x, y], 10 * px)
            editarPiso(alvo.id, { pontos: pp.pontos.map((p, i) => (i === alvo.i ? q : p)) }, false)
          } else if (alvo.tipo === 'fluxo') {
            const passo = fino ? 0.05 : 0.5
            const dx = noPasso(x - alvo.x0, passo), dy = noPasso(y - alvo.y0, passo)
            editarFluxo(alvo.id, { pontos: alvo.originais.map(([px0, py0]) => [arred(px0 + dx), arred(py0 + dy)] as Vec2) }, false)
          } else if (alvo.tipo === 'verticeFluxo') {
            const ff = fluxos.find((f) => f.id === alvo.id)
            if (!ff) return
            const passo = fino ? 0.05 : 0.5
            const q: Vec2 = [arred(noPasso(x, passo)), arred(noPasso(y, passo))]
            editarFluxo(alvo.id, { pontos: ff.pontos.map((p, i) => (i === alvo.i ? q : p)) }, false)
          } else if (alvo.tipo === 'caixa' || alvo.tipo === 'retangulo') setCaixaSel({ x0: alvo.x0, y0: alvo.y0, x1: x, y1: y })
        }}
        onPointerUp={(e) => {
          const a = arrasto.current
          arrasto.current = null
          setEtiqueta(null)
          if (a?.alvo?.tipo === 'retangulo') {
            const c = caixaSel
            setCaixaSel(null)
            if (c && a.moveu) concluirPiso(retangulo([arred(c.x0), arred(c.y0)], [arred(c.x1), arred(c.y1)]))
            return
          }
          if (a?.alvo?.tipo === 'caixa') {
            const c = caixaSel
            setCaixaSel(null)
            if (c && a.moveu) {
              const [x0, x1] = [Math.min(c.x0, c.x1), Math.max(c.x0, c.x1)]
              const [y0, y1] = [Math.min(c.y0, c.y1), Math.max(c.y0, c.y1)]
              const dentro = arvores.filter((t) => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1).map((t) => t.id)
              const ids = [...new Set([...a.alvo.somar, ...dentro])]
              selecionar(ids.length ? { tipo: 'arvores', ids } : null)
              return
            }
          }
          if (!a || a.moveu || a.alvo) return
          if (ferramenta === 'cota') {
            const [x, y] = paraMundo(e.clientX, e.clientY)
            adicionarCota(arred(x), arred(y), arred(elevacao.at(x, y)))
          } else if (ferramenta === 'piso') marcarCanto(paraMundo(e.clientX, e.clientY), 10 * px)
          else selecionar(null)
        }}
        onPointerLeave={() => {
          setCursor(null)
          setMouse(null)
        }}
        onDoubleClick={() => (ferramenta === 'piso' ? concluirPiso() : enquadrar())}
      >
        <defs>
          <PadroesPiso />
          {/* Tampo do tanque visto de cima: brilho de um lado, sombra do outro (inox) */}
          <radialGradient id="brilho-tanque" cx="0.38" cy="0.36" r="0.7">
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.7} />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity={0.08} />
            <stop offset="1" stopColor="#0b1018" stopOpacity={0.35} />
          </radialGradient>
          <pattern id="hachura-recuo" width={2} height={2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={2} stroke="#ffb020" strokeWidth={0.35} />
          </pattern>
          <pattern id="hachura-protegida" width={3} height={3} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1={0} y1={0} x2={0} y2={3} stroke="#3fd27a" strokeWidth={0.45} strokeOpacity={0.75} />
          </pattern>
          <clipPath id="recorte-lote">
            <path d={caminho(lote, true)} />
          </clipPath>
        </defs>

        <rect x={extensao.minX - 500} y={-extensao.maxY - 500} width={extensao.maxX - extensao.minX + 1000} height={extensao.maxY - extensao.minY + 1000} fill="var(--fundo-plano)" />

        {camadas.foto && <image href={f.arquivo} x={f.xMin} y={-f.yMax} width={f.largura} height={f.altura} preserveAspectRatio="none" opacity={0.8} />}

        {camadas.mata && (
          <g className="areas-protegidas">
            <path d={caminho(terreno.supressao.poligono, true)} fill="#e0a060" fillOpacity={0.07} stroke="#f0b070" strokeOpacity={0.9} strokeWidth={1.4 * px} strokeDasharray={`${7 * px} ${5 * px}`} />
            {areasProtegidas.map((a) => (
              <g key={a.id}>
                <path d={caminho(a.poligono, true)} fill="url(#hachura-protegida)" />
                <path d={caminho(a.poligono, true)} fill="#2fbf6a" fillOpacity={camadas.foto ? 0.16 : 0.24} stroke="#3fd27a" strokeWidth={2 * px} strokeLinejoin="round" />
              </g>
            ))}
          </g>
        )}

        {camadas.recuo && (
          <g>
            <path d={caminho(terreno.recuo.poligono, true)} fill="url(#hachura-recuo)" />
            <path d={caminho(terreno.recuo.poligono, true)} fill="#ffb020" fillOpacity={0.12} />
          </g>
        )}

        {pisos.map((p) => (
          <PisoNaPlanta key={p.id} p={p} px={px} selecionado={p.id === selPiso && ferramenta === 'selecionar'} />
        ))}

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

        {camadas.mata && (
          <g className="arvores">
            {arvores.map((t) => {
              const sel = arvSel.has(t.id)
              return <circle key={t.id} data-arvore={t.id} cx={t.x} cy={-t.y} r={t.copa / 2} className={sel ? 'arvore selecionada' : 'arvore'} strokeWidth={(sel ? 2 : 1) * px} />
            })}
          </g>
        )}

        {camadas.mata && <RotulosProtegidas fonte={fonte} />}

        {elementos.map((e) => (
          <Pegada key={e.id} e={e} px={px} fonte={fonte} selecionado={e.id === selElem} />
        ))}

        {pisos.map((p, i) => (
          <RotuloPiso key={p.id} p={p} px={px} fonte={fonte} acima={pisos.slice(i + 1)} />
        ))}

        {camadas.fluxos &&
          fluxos.map((f) => <FluxoNaPlanta key={f.id} f={f} px={px} fonte={fonte} selecionado={f.id === selFluxo && ferramenta === 'selecionar'} />)}

        {elemSel && ferramenta !== 'cota' && <Alcas2D e={elemSel} px={px} />}

        {ferramenta === 'piso' && <RascunhoPiso pontos={rascunho} mouse={mouse} material={materialPiso} px={px} fonte={fonte} />}
        {caixaSel && ferramenta === 'piso' && (
          <RascunhoPiso pontos={retangulo([caixaSel.x0, caixaSel.y0], [caixaSel.x1, caixaSel.y1])} mouse={null} material={materialPiso} px={px} fonte={fonte} />
        )}

        {caixaSel && ferramenta !== 'piso' && (
          <rect
            x={Math.min(caixaSel.x0, caixaSel.x1)}
            y={-Math.max(caixaSel.y0, caixaSel.y1)}
            width={Math.abs(caixaSel.x1 - caixaSel.x0)}
            height={Math.abs(caixaSel.y1 - caixaSel.y0)}
            className="caixa-selecao"
            strokeWidth={1.2 * px}
            strokeDasharray={`${5 * px} ${3 * px}`}
          />
        )}

        {etiqueta && (
          <text x={etiqueta.x} y={-etiqueta.y} fontSize={fonte * 1.05} className="etiqueta-arrasto">
            {etiqueta.texto}
          </text>
        )}

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
const centroSupressao = centroid(terreno.supressao.poligono)

/** Nomes das áreas do laudo, por cima das árvores. */
function RotulosProtegidas({ fonte }: { fonte: number }) {
  // Com obra em cima (pisos), o nome da supressão só atrapalha a leitura do projeto.
  const supressaoCoberta = useProjeto((p) => p.pisos.some((x) => contains(x.pontos, centroSupressao)))
  return (
    <g>
      {areasProtegidas.map((a) => {
        const [x, y] = centroid(a.poligono)
        const b = bbox(a.poligono)
        // A compensação é uma faixa estreita em pé: o nome vai deitado ao longo dela.
        const emPe = b.height > b.width * 2
        return (
          <g key={a.id} transform={emPe ? `rotate(-90 ${x} ${-y})` : undefined}>
            <text x={x} y={-y - fonte * 0.6} fontSize={fonte * 1.05} className="rotulo-protegida">
              {a.curto}
            </text>
            <text x={x} y={-y + fonte * 0.6} fontSize={fonte * 0.85} className="rotulo-protegida-medida">
              {a.areaM2 >= 1000 ? `${(a.areaM2 / 10000).toLocaleString('pt-BR')} ha` : fmt.m2(a.areaM2)} · não construir
            </text>
          </g>
        )
      })}
      {!supressaoCoberta && (
        <>
          <text x={centroSupressao[0]} y={-centroSupressao[1] - fonte * 0.55} fontSize={fonte * 0.85} className="rotulo-supressao">
            Supressão autorizada
          </text>
          <text x={centroSupressao[0]} y={-centroSupressao[1] + fonte * 0.55} fontSize={fonte * 0.75} className="rotulo-supressao">
            ligustros · 0,49 ha
          </text>
        </>
      )}
    </g>
  )
}

function Pegada({ e, px, fonte, selecionado }: { e: Elemento; px: number; fonte: number; selecionado: boolean }) {
  const invadida = useMemo(() => !!areaInvadida(e), [e])
  const cor = invadida ? '#ff5a5f' : selecionado ? COR_SELECAO : '#ffffff'
  // Nome e medidas só quando o texto cabe dentro do elemento na tela (150 tanques viram uma sopa de letras).
  const cabeRotulo = useMemo(() => {
    if (selecionado) return true
    if (finoComoMuro(e)) return false
    // Cordas horizontal e vertical que passam pelo centro do retângulo girado.
    const r = (e.rot * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
    const corda = (a: number, b: number) => Math.min(a / Math.max(c, 1e-6), b / Math.max(s, 1e-6))
    const larg = e.tipo === 'tanque' ? e.largura : corda(e.largura, e.comprimento)
    const alt = e.tipo === 'tanque' ? e.largura : corda(e.comprimento, e.largura)
    return e.nome.length * 0.56 * fonte < larg && fonte * 2.4 < alt
  }, [e, fonte, selecionado])
  const forma =
    e.tipo === 'tanque' ? (
      <circle cx={e.x} cy={-e.y} r={e.largura / 2} />
    ) : (
      <path d={caminho(contorno(e), true)} />
    )
  return (
    <g data-elemento={e.id} className="alvo-arrastavel">
      <g fill={e.cor} fillOpacity={e.tipo === 'tanque' || e.tipo === 'galpao' ? 1 : 0.85} stroke={cor} strokeWidth={(selecionado || invadida ? 2.5 : e.tipo === 'tanque' ? 0.8 : 1.2) * px} strokeDasharray={invadida ? `${5 * px} ${3 * px}` : undefined}>
        {forma}
      </g>
      {e.tipo === 'tanque' && (
        <g pointerEvents="none">
          <circle cx={e.x} cy={-e.y} r={e.largura / 2} fill="url(#brilho-tanque)" />
          <circle cx={e.x} cy={-e.y} r={Math.min(0.3, e.largura * 0.12)} fill="none" stroke="rgba(20,28,38,0.45)" strokeWidth={0.8 * px} />
        </g>
      )}
      {e.tipo === 'galpao' && <TelhadoNaPlanta e={e} px={px} />}
      {cabeRotulo && (
        <>
          <text x={e.x} y={-e.y - fonte * 0.4} fontSize={fonte} className="rotulo-elemento">
            {e.nome}
          </text>
          <text x={e.x} y={-e.y + fonte * 0.9} fontSize={fonte * 0.85} className="rotulo-elemento-medida">
            {e.tipo === 'tanque' ? `Ø ${fmt.m(e.largura, 1)}` : `${fmt.m(e.largura, 1)} × ${fmt.m(e.comprimento, 1)}`}
          </text>
        </>
      )}
    </g>
  )
}

/** Cobertura do galpão vista de cima: cumeeira no lado maior e uma água mais escura. */
function TelhadoNaPlanta({ e, px }: { e: Elemento; px: number }) {
  const a = (e.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
  const mundo = (lx: number, ly: number): Vec2 => [e.x + lx * c - ly * sn, e.y + lx * sn + ly * c]
  const L = e.largura / 2, C = e.comprimento / 2
  const deitado = e.largura >= e.comprimento
  const cumeeira = deitado ? [mundo(-L, 0), mundo(L, 0)] : [mundo(0, -C), mundo(0, C)]
  const sombra = deitado ? [mundo(-L, 0), mundo(L, 0), mundo(L, -C), mundo(-L, -C)] : [mundo(0, -C), mundo(0, C), mundo(L, C), mundo(L, -C)]
  return (
    <g pointerEvents="none">
      <path d={caminho(sombra, true)} fill="rgba(12,18,28,0.12)" />
      <path d={caminho(cumeeira)} stroke="rgba(12,18,28,0.35)" strokeWidth={1.4 * px} fill="none" />
    </g>
  )
}

/** Encaixe de um canto arrastado: gruda nos cantos conhecidos, menos nos do próprio piso. */
function encaixarSem(proprios: Vec2[], p: Vec2, tolerancia: number): Vec2 {
  const q = encaixar(p, tolerancia)
  return proprios.some((c) => c[0] === q[0] && c[1] === q[1]) ? [arred(p[0]), arred(p[1])] : q
}

/** Ponto da face `lado`, afastado `folga` metros para fora. */
function pontoLado(e: Elemento, lado: Lado, folga = 0): Vec2 {
  const [dx, dy] = direcaoLado(e, lado)
  const meio = (lado[0] === 'x' ? e.largura : e.comprimento) / 2 + folga
  return [e.x + dx * meio, e.y + dy * meio]
}

function rotuloLado(e: Elemento, lado: Lado) {
  if (e.tipo === 'tanque') return `Ø ${metros(e.largura)}`
  if (lado[0] === 'x') return `${finoComoMuro(e) ? 'Espessura' : 'Largura'} ${metros(e.largura)}`
  return `Comprimento ${metros(e.comprimento)}`
}

/** Alças na planta: um puxador em cada face e um para girar, como no 3D. */
function Alcas2D({ e, px }: { e: Elemento; px: number }) {
  const [gx, gy] = pontoLado(e, 'y+', 30 * px)
  const [bx, by] = pontoLado(e, 'y+')
  return (
    <g className="alcas">
      <line x1={bx} y1={-by} x2={gx} y2={-gy} stroke="#fff" strokeOpacity={0.8} strokeWidth={1.5 * px} />
      {LADOS.map((lado) => {
        const [x, y] = pontoLado(e, lado)
        const [dx, dy] = direcaoLado(e, lado)
        const r = 6 * px
        // seta pequena apontando para fora da face
        const ponta: Vec2 = [x + dx * r * 2.2, y + dy * r * 2.2]
        const base1: Vec2 = [x + dx * r * 1.2 - dy * r * 0.8, y + dy * r * 1.2 + dx * r * 0.8]
        const base2: Vec2 = [x + dx * r * 1.2 + dy * r * 0.8, y + dy * r * 1.2 - dx * r * 0.8]
        return (
          <g key={lado} data-alca={lado} className="alca">
            <title>{rotuloLado(e, lado)}</title>
            <circle cx={x} cy={-y} r={r * 2.4} fill="transparent" />
            <path d={caminho([ponta, base1, base2], true)} className="alca-seta" />
            <circle cx={x} cy={-y} r={r} className="alca-ponto" strokeWidth={2 * px} />
          </g>
        )
      })}
      <g data-alca="giro" className="alca giro">
        <title>Girar (Shift: de 1 em 1 grau)</title>
        <circle cx={gx} cy={-gy} r={14 * px} fill="transparent" />
        <circle cx={gx} cy={-gy} r={7 * px} className="alca-giro" strokeWidth={2 * px} />
      </g>
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
