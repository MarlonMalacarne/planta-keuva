import * as THREE from 'three'
import { dist, rng, type Vec2 } from '../geo/polygon'
import { materiais, type MaterialPiso } from '../model/pisos'
import { normaisDoCanvas } from './texturas3d'

/**
 * Malha que acompanha o relevo dentro do contorno `pts`, `elevar` metros acima do chão.
 * Triângulos grandes ficariam retos e sumiriam sob o relevo: divide até lados de ~3 m.
 * Com `escalaUV`, ganha coordenadas de textura em metros (1 repetição a cada `escalaUV` m).
 */
export function geometriaNoChao(pts: Vec2[], h: (x: number, y: number) => number, elevar: number, escalaUV?: number) {
  const g = new THREE.BufferGeometry()
  if (pts.length < 3) return g
  const contorno = pts.map(([x, y]) => new THREE.Vector2(x, y))
  const pilha = THREE.ShapeUtils.triangulateShape(contorno, []).map((t) => t.map((i) => pts[i]) as [Vec2, Vec2, Vec2])
  const meio = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const pos: number[] = []
  const uv: number[] = []
  while (pilha.length) {
    const [a, b, c] = pilha.pop()!
    if (Math.max(dist(a, b), dist(b, c), dist(c, a)) > 3) {
      const ab = meio(a, b), bc = meio(b, c), ca = meio(c, a)
      pilha.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
      continue
    }
    // Sentido anti-horário visto de cima, para a face apontar para o céu.
    const giro = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    for (const [x, y] of giro >= 0 ? [a, b, c] : [a, c, b]) {
      pos.push(x, h(x, y) + elevar, -y)
      if (escalaUV) uv.push(x / escalaUV, y / escalaUV)
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (escalaUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Tamanho (m) de uma repetição da textura de cada material. */
export const escalaTextura: Record<MaterialPiso, number> = { asfalto: 6, cascalho: 3, concreto: 4, bloquete: 1.6, grama: 4, terra: 5 }

/** Força do relevo (mapa de normais) e aspereza de cada material. */
const acabamento: Record<MaterialPiso, { relevo: number; aspereza: number }> = {
  asfalto: { relevo: 2.2, aspereza: 0.9 },
  cascalho: { relevo: 4, aspereza: 0.95 },
  concreto: { relevo: 1.2, aspereza: 0.82 },
  bloquete: { relevo: 3, aspereza: 0.88 },
  grama: { relevo: 2.5, aspereza: 0.95 },
  terra: { relevo: 1.6, aspereza: 0.97 },
}
export const asperezaPiso = (m: MaterialPiso) => acabamento[m].aspereza

const texturas = new Map<MaterialPiso, { mapa: THREE.CanvasTexture; normais: THREE.Texture }>()

const tom = (cor: string, f: number) => {
  const c = new THREE.Color(cor)
  c.offsetHSL(0, 0, f)
  return '#' + c.getHexString()
}

/** Desenho do material num canvas que emenda nas bordas (sem arquivos). */
function desenhar(m: MaterialPiso) {
  const N = 512
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const r = rng(m.length * 97 + m.charCodeAt(0))
  // Na luz do 3D o asfalto escuro vira preto: a base é um cinza de asfalto já gasto.
  const base = m === 'asfalto' ? '#55585d' : m === 'grama' ? '#65864a' : m === 'bloquete' ? tom(materiais[m].cor, 0.03) : tom(materiais[m].cor, 0.02)
  g.fillStyle = base
  g.fillRect(0, 0, N, N)
  /** Desenha nas 9 posições para a textura emendar sem costura. */
  const emendado = (x: number, y: number, raio: number, f: (x: number, y: number) => void) => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) if (x + dx > -raio && x + dx < N + raio && y + dy > -raio && y + dy < N + raio) f(x + dx, y + dy)
  }
  const pontos = (n: number, rMin: number, rMax: number, var_: number, sombra = false) => {
    for (let i = 0; i < n; i++) {
      const x = r() * N, y = r() * N, rr = rMin + r() * (rMax - rMin)
      const cor = tom(base, (r() - 0.5) * var_)
      emendado(x, y, rr + 2, (px, py) => {
        if (sombra) {
          g.fillStyle = 'rgba(0,0,0,0.25)'
          g.beginPath()
          g.arc(px + rr * 0.3, py + rr * 0.35, rr, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = cor
        g.beginPath()
        g.ellipse(px, py, rr, rr * (0.7 + r() * 0.3), r() * Math.PI, 0, Math.PI * 2)
        g.fill()
      })
    }
  }
  const manchas = (n: number, rMin: number, rMax: number, cor: string, alfa: number) => {
    for (let i = 0; i < n; i++) {
      const x = r() * N, y = r() * N, rr = rMin + r() * (rMax - rMin)
      emendado(x, y, rr, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, rr)
        gr.addColorStop(0, cor.replace('A', String(alfa)))
        gr.addColorStop(1, cor.replace('A', '0'))
        g.fillStyle = gr
        g.fillRect(px - rr, py - rr, rr * 2, rr * 2)
      })
    }
  }
  if (m === 'asfalto') {
    manchas(14, 40, 120, 'rgba(20,22,26,A)', 0.16)
    manchas(8, 30, 90, 'rgba(140,140,140,A)', 0.07)
    pontos(9000, 0.5, 1.5, 0.28)
    pontos(900, 1.2, 2.4, 0.18)
  } else if (m === 'cascalho') {
    manchas(10, 50, 140, 'rgba(90,80,65,A)', 0.15)
    pontos(2600, 2.5, 6, 0.32, true)
  } else if (m === 'terra') {
    manchas(16, 40, 130, 'rgba(70,50,30,A)', 0.18)
    pontos(900, 3, 10, 0.12)
    pontos(2000, 0.8, 2, 0.2)
  } else if (m === 'grama') {
    manchas(14, 50, 150, 'rgba(150,140,60,A)', 0.14)
    manchas(14, 40, 130, 'rgba(20,50,20,A)', 0.18)
    g.lineCap = 'round'
    for (let i = 0; i < 16000; i++) {
      const x = r() * N, y = r() * N
      const cor = tom(base, (r() - 0.45) * 0.3)
      const dx = (r() - 0.5) * 5, dy = -4 - r() * 7, w = 0.8 + r() * 1.2
      emendado(x, y, 12, (px, py) => {
        g.strokeStyle = cor
        g.lineWidth = w
        g.beginPath()
        g.moveTo(px, py)
        g.lineTo(px + dx, py + dy)
        g.stroke()
      })
    }
  } else if (m === 'concreto') {
    manchas(18, 40, 140, 'rgba(110,105,95,A)', 0.12)
    manchas(10, 30, 90, 'rgba(255,255,250,A)', 0.12)
    pontos(5000, 0.5, 1.2, 0.07)
    // juntas serradas a cada 4 m (a textura inteira) e no meio
    g.strokeStyle = tom(base, -0.22)
    g.lineWidth = 2
    g.strokeRect(1, 1, N - 2, N - 2)
    g.globalAlpha = 0.5
    g.beginPath()
    g.moveTo(N / 2, 0)
    g.lineTo(N / 2, N)
    g.moveTo(0, N / 2)
    g.lineTo(N, N / 2)
    g.stroke()
    g.globalAlpha = 1
  } else if (m === 'bloquete') {
    // Paver retangular (20 × 10 cm) em fileiras desencontradas
    g.fillStyle = tom(base, -0.25)
    g.fillRect(0, 0, N, N)
    const linhas = 16, colunas = 8, lb = N / colunas, hb = N / linhas
    for (let j = 0; j < linhas; j++)
      for (let i = -1; i <= colunas; i++) {
        const x = i * lb + (j % 2 ? lb / 2 : 0), y = j * hb
        g.fillStyle = tom(base, (r() - 0.5) * 0.12)
        g.beginPath()
        g.roundRect(x + 1.5, y + 1.5, lb - 3, hb - 3, 3)
        g.fill()
      }
    pontos(3000, 0.5, 1.2, 0.1)
  }
  return c
}

/** Textura (cor e relevo) igual para todos os pisos do mesmo material. */
export function texturaPiso(m: MaterialPiso) {
  return texturasPiso(m).mapa
}

export function texturasPiso(m: MaterialPiso) {
  const pronta = texturas.get(m)
  if (pronta) return pronta
  const c = desenhar(m)
  const mapa = new THREE.CanvasTexture(c)
  mapa.wrapS = mapa.wrapT = THREE.RepeatWrapping
  mapa.colorSpace = THREE.SRGBColorSpace
  mapa.anisotropy = 8
  const normais = normaisDoCanvas(c, acabamento[m].relevo)
  const par = { mapa, normais }
  texturas.set(m, par)
  return par
}
