import * as THREE from 'three'
import { rng } from '../geo/polygon'

/**
 * Texturas desenhadas no canvas, sem arquivos: o app abre sem internet e continua leve.
 * Cada uma representa 1 × 1 m (as geometrias usam UV em metros), salvo indicação.
 */

const prontas = new Map<string, unknown>()

function guardar<T>(chave: string, criar: () => T): T {
  if (!prontas.has(chave)) prontas.set(chave, criar())
  return prontas.get(chave) as T
}

type ComRelevo = { mapa: THREE.Texture; normais: THREE.Texture }

function tela(n: number, m = n) {
  const c = document.createElement('canvas')
  c.width = n
  c.height = m
  return { c, g: c.getContext('2d')! }
}

function comoTextura(c: HTMLCanvasElement, cor: boolean) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (cor) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Mapa de normais a partir de um mapa de alturas (0..1), com `forca` no relevo. */
export function normalDeAltura(alt: Float32Array, n: number, m: number, forca: number) {
  const { c, g } = tela(n, m)
  const img = g.createImageData(n, m)
  const a = (x: number, y: number) => alt[((y + m) % m) * n + ((x + n) % n)]
  for (let y = 0; y < m; y++)
    for (let x = 0; x < n; x++) {
      const dx = (a(x + 1, y) - a(x - 1, y)) * forca
      const dy = (a(x, y + 1) - a(x, y - 1)) * forca
      const l = Math.hypot(dx, dy, 1)
      const k = (y * n + x) * 4
      img.data[k] = ((-dx / l) * 0.5 + 0.5) * 255
      img.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255
      img.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return comoTextura(c, false)
}

/** Ruído suave que se repete (valor em grade + interpolação), de 0 a 1. */
function ruido(n: number, celulas: number, semente: number) {
  const r = rng(semente)
  const grade = Array.from({ length: celulas * celulas }, () => r())
  const v = (i: number, j: number) => grade[((j + celulas) % celulas) * celulas + ((i + celulas) % celulas)]
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * celulas, fy = (y / n) * celulas
      const i = Math.floor(fx), j = Math.floor(fy)
      const tx = fx - i, ty = fy - j
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
      const a = v(i, j) + (v(i + 1, j) - v(i, j)) * sx
      const b = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * sx
      out[y * n + x] = a + (b - a) * sy
    }
  return out
}

/** Várias oitavas de ruído somadas (0..1). */
function fractal(n: number, oitavas: [celulas: number, peso: number][], semente: number) {
  const out = new Float32Array(n * n)
  let total = 0
  oitavas.forEach(([cel, peso], i) => {
    const r = ruido(n, cel, semente + i * 101)
    for (let k = 0; k < out.length; k++) out[k] += r[k] * peso
    total += peso
  })
  for (let k = 0; k < out.length; k++) out[k] /= total
  return out
}

function cinzaDe(valores: Float32Array, n: number, m: number, min: number, max: number) {
  const { c, g } = tela(n, m)
  const img = g.createImageData(n, m)
  for (let k = 0; k < n * m; k++) {
    const v = (min + (max - min) * valores[k]) * 255
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = v
    img.data[k * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

/**
 * Telha metálica trapezoidal (paredes e cobertura do pavilhão): 4 ondas por metro, nervuras
 * na direção v. Devolve cor (clara, multiplica a cor do material) e normais.
 */
export function texturaTelha(): ComRelevo {
  return guardar('telha', () => {
    const n = 256
    const alt = new Float32Array(n * n)
    const sujeira = fractal(n, [[4, 1], [16, 0.5]], 7)
    const perfil = (u: number) => {
      const f = (u * 4) % 1 // posição dentro da onda
      if (f < 0.12) return f / 0.12
      if (f < 0.38) return 1
      if (f < 0.5) return 1 - (f - 0.38) / 0.12
      return 0
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) alt[y * n + x] = perfil(x / n)
    const cor = new Float32Array(n * n)
    for (let k = 0; k < n * n; k++) cor[k] = 0.82 + alt[k] * 0.1 + (sujeira[k] - 0.5) * 0.12
    const mapa = comoTextura(cinzaDe(cor, n, n, 0, 1), true)
    return { mapa, normais: normalDeAltura(alt, n, n, 1.6) }
  })
}

/** Porta seccional: painéis de 0,5 m com frisos. */
export function texturaPorta(): ComRelevo {
  return guardar('porta', () => {
    const n = 128
    const alt = new Float32Array(n * n)
    for (let y = 0; y < n; y++) {
      const f = ((y / n) * 2) % 1
      const h = f < 0.04 || f > 0.96 ? 0 : f > 0.3 && f < 0.34 ? 0.4 : f > 0.66 && f < 0.7 ? 0.4 : 1
      for (let x = 0; x < n; x++) alt[y * n + x] = h
    }
    const cor = new Float32Array(n * n).map((_, k) => 0.85 + alt[k] * 0.15)
    return { mapa: comoTextura(cinzaDe(cor, n, n, 0, 1), true), normais: normalDeAltura(alt, n, n, 2) }
  })
}

/** Vidro com caixilhos: módulo de 1,25 × 3 m (UV em metros: repetir 0,8 × 0,333). */
export function texturaVidro() {
  return guardar('vidro', () => {
    const { c, g } = tela(128, 256)
    const grad = g.createLinearGradient(0, 0, 128, 256)
    grad.addColorStop(0, '#9fb0bd')
    grad.addColorStop(0.5, '#6d808f')
    grad.addColorStop(1, '#8899a6')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 256)
    g.fillStyle = '#2b3138'
    g.fillRect(0, 0, 128, 6)
    g.fillRect(0, 0, 5, 256)
    g.fillRect(0, 124, 128, 4)
    return comoTextura(c, true)
  })
}

/** Concreto (pré-moldado, base de tanque): manchas leves, 2 × 2 m. */
export function texturaConcreto(): ComRelevo {
  return guardar('concreto', () => {
    const n = 256
    const v = fractal(n, [[3, 1], [12, 0.6], [48, 0.35], [128, 0.25]], 3)
    return { mapa: comoTextura(cinzaDe(v, n, n, 0.78, 1), true), normais: normalDeAltura(v, n, n, 1.2) }
  })
}

/** Inox escovado: riscos finos na vertical (cor clara que multiplica a cor do tanque). */
export function texturaInox() {
  return guardar('inox', () => {
    const n = 256
    const r = rng(11)
    const linhas = Array.from({ length: n }, () => 0.9 + r() * 0.1)
    const manchas = fractal(n, [[2, 1], [6, 0.5]], 5)
    const v = new Float32Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) v[y * n + x] = linhas[x] * (0.9 + manchas[y * n + x] * 0.1)
    return comoTextura(cinzaDe(v, n, n, 0, 1), true)
  })
}

/** Folhagem: tufos claros e escuros, para a copa das árvores ter textura de perto. */
export function texturaFolhas() {
  return guardar('folhas', () => {
    const n = 256
    const { c, g } = tela(n)
    const r = rng(23)
    g.fillStyle = '#7d7d7d'
    g.fillRect(0, 0, n, n)
    for (let i = 0; i < 2600; i++) {
      const x = r() * n, y = r() * n, s = 2 + r() * 5
      const l = 90 + r() * 165
      g.fillStyle = `rgb(${l},${l},${l})`
      g.beginPath()
      g.ellipse(x, y, s, s * (0.5 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2)
      g.fill()
      // repete nas bordas para emendar sem costura
      if (x < s || x > n - s || y < s || y > n - s) {
        g.beginPath()
        g.ellipse((x + n / 2) % n, (y + n / 2) % n, s, s * 0.7, r() * Math.PI, 0, Math.PI * 2)
        g.fill()
      }
    }
    return comoTextura(c, true)
  })
}

/** Detalhe do chão (cinza 0..1) para dar textura à foto aérea de perto. */
export function texturaDetalheChao() {
  return guardar('detalhe-chao', () => {
    const n = 256
    const fino = fractal(n, [[16, 1], [64, 0.8], [128, 0.6]], 41)
    const largo = fractal(n, [[3, 1], [7, 0.6]], 43)
    const { c, g } = tela(n)
    const img = g.createImageData(n, n)
    for (let k = 0; k < n * n; k++) {
      img.data[k * 4] = fino[k] * 255
      img.data[k * 4 + 1] = largo[k] * 255
      img.data[k * 4 + 2] = 128
      img.data[k * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    return comoTextura(c, false)
  })
}

/** Normais genéricas a partir do brilho de um canvas (asfalto, cascalho, bloquete). */
export function normaisDoCanvas(c: HTMLCanvasElement, forca: number) {
  const g = c.getContext('2d')!
  const { width: n, height: m } = c
  const d = g.getImageData(0, 0, n, m).data
  const alt = new Float32Array(n * m)
  for (let k = 0; k < n * m; k++) alt[k] = (d[k * 4] + d[k * 4 + 1] + d[k * 4 + 2]) / 765
  return normalDeAltura(alt, n, m, forca)
}
