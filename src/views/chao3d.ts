import * as THREE from 'three'
import { dist, rng, type Vec2 } from '../geo/polygon'
import { materiais, type MaterialPiso } from '../model/pisos'

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
export const escalaTextura: Record<MaterialPiso, number> = { asfalto: 4, cascalho: 2, concreto: 3, bloquete: 1.2, grama: 3, terra: 4 }

const texturas = new Map<MaterialPiso, THREE.CanvasTexture>()

const tom = (cor: string, f: number) => {
  const c = new THREE.Color(cor)
  c.offsetHSL(0, 0, f)
  return '#' + c.getHexString()
}

/** Textura desenhada no canvas (sem arquivos), igual para todos os pisos do mesmo material. */
export function texturaPiso(m: MaterialPiso) {
  const pronta = texturas.get(m)
  if (pronta) return pronta
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  // Com a luz do 3D o asfalto escuro vira preto: clareia um pouco a base.
  const base = tom(materiais[m].cor, m === 'asfalto' ? 0.11 : 0.02)
  const r = rng(m.length * 97 + m.charCodeAt(0))
  g.fillStyle = base
  g.fillRect(0, 0, N, N)
  const pontos = (n: number, rMin: number, rMax: number, var_: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = tom(base, (r() - 0.5) * var_)
      g.beginPath()
      g.arc(r() * N, r() * N, rMin + r() * (rMax - rMin), 0, Math.PI * 2)
      g.fill()
    }
  }
  if (m === 'asfalto') pontos(2200, 0.6, 1.8, 0.22)
  else if (m === 'cascalho') pontos(900, 2, 5.5, 0.3)
  else if (m === 'terra') {
    pontos(500, 3, 10, 0.12)
    pontos(500, 0.8, 2, 0.2)
  } else if (m === 'grama') {
    g.lineCap = 'round'
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = tom(base, (r() - 0.5) * 0.22)
      g.lineWidth = 1 + r()
      const x = r() * N, y = r() * N
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5)
      g.stroke()
    }
  } else if (m === 'concreto') {
    pontos(700, 0.6, 1.4, 0.06)
    g.strokeStyle = tom(base, -0.16)
    g.lineWidth = 2
    g.strokeRect(1, 1, N - 2, N - 2)
  } else if (m === 'bloquete') {
    const linhas = 6, larg = N / 3
    for (let j = 0; j < linhas; j++)
      for (let i = -1; i < 4; i++) {
        const x = i * larg + (j % 2 ? larg / 2 : 0), y = (j * N) / linhas
        g.fillStyle = tom(base, (r() - 0.5) * 0.08)
        g.fillRect(x + 1.5, y + 1.5, larg - 3, N / linhas - 3)
      }
    g.globalCompositeOperation = 'destination-over'
    g.fillStyle = tom(base, -0.2)
    g.fillRect(0, 0, N, N)
    g.globalCompositeOperation = 'source-over'
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  texturas.set(m, t)
  return t
}
