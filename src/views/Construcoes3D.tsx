import { useEffect, useMemo } from 'react'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Elemento } from '../model/elementos'
import { texturaConcreto, texturaInox, texturaPorta, texturaTelha, texturaVidro } from './texturas3d'

const COR_SELECAO = '#5b8cff'
type V3 = [number, number, number]

/**
 * Metais e vidros refletem o céu com força; o resto da cena recebe pouco do ambiente (senão a
 * foto do chão fica lavada). `Reflexos` (no Scene3D) aplica o ambiente a estes materiais.
 */
export const refletivos = new Map<THREE.MeshStandardMaterial, number>()
const refletivo = (m: THREE.MeshStandardMaterial, intensidade: number) => {
  refletivos.set(m, intensidade)
  return m
}

/** Tom de seleção: o elemento ganha um brilho azul leve. */
function marcar(m: THREE.MeshStandardMaterial, selecionado: boolean) {
  if (selecionado) {
    m.emissive = new THREE.Color(COR_SELECAO)
    m.emissiveIntensity = 0.14
  }
  return m
}

/** Caixa invisível só para desenhar o contorno de seleção. */
export function ContornoSelecao({ largura, altura, comprimento }: { largura: number; altura: number; comprimento: number }) {
  return (
    <mesh position={[0, altura / 2, 0]} raycast={() => null}>
      <boxGeometry args={[largura, altura, comprimento]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color={COR_SELECAO} lineWidth={2} threshold={15} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ Pavilhão (galpão) */

/** Monta uma malha de quadriláteros com UV em metros, separada em grupos por material. */
class Montador {
  private grupos: { pos: number[]; nor: number[]; uv: number[] }[] = []
  constructor(nMateriais: number) {
    for (let i = 0; i < nMateriais; i++) this.grupos.push({ pos: [], nor: [], uv: [] })
  }
  tri(mat: number, a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number]) {
    const g = this.grupos[mat]
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize()
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]] as [V3, [number, number]][]) {
      g.pos.push(...p)
      g.nor.push(n.x, n.y, n.z)
      g.uv.push(...u)
    }
  }
  /** a, b, c, d no sentido anti-horário visto de fora; UV: u ao longo de a→b, v ao longo de a→d. */
  quad(mat: number, a: V3, b: V3, c: V3, d: V3, larguraU?: number, alturaV?: number, u0 = 0, v0 = 0) {
    const lu = larguraU ?? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const lv = alturaV ?? Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2])
    this.tri(mat, a, b, c, [u0, v0], [u0 + lu, v0], [u0 + lu, v0 + lv])
    this.tri(mat, a, c, d, [u0, v0], [u0 + lu, v0 + lv], [u0, v0 + lv])
  }
  montar() {
    const g = new THREE.BufferGeometry()
    const pos: number[] = [], nor: number[] = [], uv: number[] = []
    this.grupos.forEach((x, i) => {
      g.addGroup(pos.length / 3, x.pos.length / 3, i)
      pos.push(...x.pos)
      nor.push(...x.nor)
      uv.push(...x.uv)
    })
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    return g
  }
}

// Materiais do pavilhão (índices dos grupos)
const TELHA = 0, COBERTURA = 1, CONCRETO = 2, PORTA = 3, VIDRO = 4, CLARABOIA = 5, ACABAMENTO = 6

/**
 * Pavilhão industrial: fechamento em telha trapezoidal sobre mureta de concreto pré-moldado,
 * cobertura em duas águas com cumeeira no lado maior, claraboias, faixa de janelas alta,
 * portas seccionais com marquise numa fachada e pele de vidro do escritório na outra.
 * Montado num referencial com a cumeeira em x (comprimento A) e o vão em z (B).
 */
function geometriaGalpao(A: number, B: number, H: number) {
  const m = new Montador(7)
  const P = Math.max(2.5, H * 0.72) // pé-direito na fachada
  const sobe = Math.max(0.3, H - P)
  const e = 0.7 // beiral
  const s = sobe / (B / 2)
  const yE = P - e * s, zE = B / 2 + e
  const hb = Math.min(1.2, P * 0.25) // mureta
  const o = 0.06 // a mureta sai um pouco da parede
  const a2 = A / 2, b2 = B / 2

  // Portas seccionais na fachada de trás (z = -B/2) e vidro do escritório na da frente (z = +B/2).
  const nPortas = Math.max(1, Math.min(8, Math.floor(A / 10)))
  const wp = Math.min(4.5, (A / nPortas) * 0.6), hp = Math.min(5, P - 2.4)
  const portas = Array.from({ length: nPortas }, (_, i) => -a2 + (A * (i + 0.5)) / nPortas)
  const wv = Math.min(20, A * 0.35)
  const vidro: [number, number] = [a2 - 3 - wv, a2 - 3]
  const hv = Math.min(7, P - 1.6)

  // Paredes de telha acima da mureta
  m.quad(TELHA, [-a2, hb, b2], [a2, hb, b2], [a2, P, b2], [-a2, P, b2], A, P - hb, 0, hb)
  m.quad(TELHA, [a2, hb, -b2], [-a2, hb, -b2], [-a2, P, -b2], [a2, P, -b2], A, P - hb, 0, hb)
  m.quad(TELHA, [a2, hb, b2], [a2, hb, -b2], [a2, P, -b2], [a2, P, b2], B, P - hb, 0, hb)
  m.quad(TELHA, [-a2, hb, -b2], [-a2, hb, b2], [-a2, P, b2], [-a2, P, -b2], B, P - hb, 0, hb)
  m.tri(TELHA, [a2, P, b2], [a2, P, -b2], [a2, H, 0], [0, P], [B, P], [b2, H])
  m.tri(TELHA, [-a2, P, -b2], [-a2, P, b2], [-a2, H, 0], [0, P], [B, P], [b2, H])

  // Mureta de concreto, interrompida nas portas e no vidro
  const trechos = (furos: [number, number][]) => {
    const out: [number, number][] = []
    let x = -a2 - o
    for (const [f0, f1] of [...furos].sort((p, q) => p[0] - q[0])) {
      if (f0 > x) out.push([x, f0])
      x = Math.max(x, f1)
    }
    if (x < a2 + o) out.push([x, a2 + o])
    return out
  }
  const zf = b2 + o, xf = a2 + o
  for (const [x0, x1] of trechos([vidro])) m.quad(CONCRETO, [x0, 0, zf], [x1, 0, zf], [x1, hb, zf], [x0, hb, zf], x1 - x0, hb, x0)
  for (const [x0, x1] of trechos(portas.map((x) => [x - wp / 2 - 0.2, x + wp / 2 + 0.2]))) m.quad(CONCRETO, [-x0, 0, -zf], [-x1, 0, -zf], [-x1, hb, -zf], [-x0, hb, -zf], x1 - x0, hb, x0)
  m.quad(CONCRETO, [xf, 0, zf], [xf, 0, -zf], [xf, hb, -zf], [xf, hb, zf], B + 2 * o, hb)
  m.quad(CONCRETO, [-xf, 0, -zf], [-xf, 0, zf], [-xf, hb, zf], [-xf, hb, -zf], B + 2 * o, hb)
  // topo da mureta
  m.quad(CONCRETO, [-xf, hb, zf], [xf, hb, zf], [xf, hb, b2], [-xf, hb, b2], A, o)
  m.quad(CONCRETO, [xf, hb, -zf], [-xf, hb, -zf], [-xf, hb, -b2], [xf, hb, -b2], A, o)
  m.quad(CONCRETO, [xf, hb, zf], [xf, hb, -zf], [a2, hb, -zf], [a2, hb, zf], B, o)
  m.quad(CONCRETO, [-xf, hb, -zf], [-xf, hb, zf], [-a2, hb, zf], [-a2, hb, -zf], B, o)

  // Cobertura (duas águas) com rufos e calhas
  const larg = A + 2 * e
  const lAgua = Math.hypot(zE, H - yE)
  m.quad(COBERTURA, [-a2 - e, yE, zE], [a2 + e, yE, zE], [a2 + e, H, 0], [-a2 - e, H, 0], larg, lAgua, -a2 - e)
  m.quad(COBERTURA, [a2 + e, yE, -zE], [-a2 - e, yE, -zE], [-a2 - e, H, 0], [a2 + e, H, 0], larg, lAgua, -a2 - e)
  const calha = 0.28
  m.quad(ACABAMENTO, [-a2 - e, yE - calha, zE], [a2 + e, yE - calha, zE], [a2 + e, yE, zE], [-a2 - e, yE, zE])
  m.quad(ACABAMENTO, [a2 + e, yE - calha, -zE], [-a2 - e, yE - calha, -zE], [-a2 - e, yE, -zE], [a2 + e, yE, -zE])
  for (const lado of [1, -1]) {
    const x = lado * (a2 + e)
    for (const z of [zE, -zE]) m.quad(ACABAMENTO, [x, yE - calha, z], [x, H - calha, 0], [x, H, 0], [x, yE, z])
  }
  // Cumeeira
  m.quad(ACABAMENTO, [-a2 - e, H - 0.02, 0.35], [a2 + e, H - 0.02, 0.35], [a2 + e, H + 0.06, 0], [-a2 - e, H + 0.06, 0])
  m.quad(ACABAMENTO, [a2 + e, H - 0.02, -0.35], [-a2 - e, H - 0.02, -0.35], [-a2 - e, H + 0.06, 0], [a2 + e, H + 0.06, 0])

  // Claraboias: faixas translúcidas descendo as águas, a cada ~7,5 m
  const nCl = Math.max(1, Math.round(A / 7.5))
  for (const lado of [1, -1]) {
    const nrm = new THREE.Vector3(0, zE, lado * (H - yE)).normalize().multiplyScalar(0.05)
    const ponto = (x: number, t: number): V3 => {
      const f = t / lAgua
      return [x + nrm.x, yE + (H - yE) * f + nrm.y, lado * zE * (1 - f) + nrm.z]
    }
    for (let i = 0; i < nCl; i++) {
      const xc = -a2 + (A * (i + 0.5)) / nCl, w = 0.55
      const t0 = 1.6, t1 = lAgua - 1.4
      const [p, q] = lado > 0 ? [xc - w, xc + w] : [xc + w, xc - w]
      m.quad(CLARABOIA, ponto(p, t0), ponto(q, t0), ponto(q, t1), ponto(p, t1))
    }
  }

  // Faixa de janelas alta nas duas fachadas compridas
  const j0 = P - 2.1, j1 = P - 1.25
  if (j0 > hp + 0.8) {
    m.quad(VIDRO, [-a2 + 2, j0, b2 + 0.03], [a2 - 2, j0, b2 + 0.03], [a2 - 2, j1, b2 + 0.03], [-a2 + 2, j1, b2 + 0.03], A - 4, j1 - j0)
    m.quad(VIDRO, [a2 - 2, j0, -b2 - 0.03], [-a2 + 2, j0, -b2 - 0.03], [-a2 + 2, j1, -b2 - 0.03], [a2 - 2, j1, -b2 - 0.03], A - 4, j1 - j0)
  }

  // Portas seccionais com batentes e uma marquise contínua
  const zp = -b2 - 0.04
  for (const x of portas) {
    m.quad(PORTA, [x + wp / 2, 0.02, zp], [x - wp / 2, 0.02, zp], [x - wp / 2, hp, zp], [x + wp / 2, hp, zp], wp, hp)
    const zb = zp - 0.12
    m.quad(ACABAMENTO, [x + wp / 2 + 0.2, 0, zb], [x + wp / 2, 0, zb], [x + wp / 2, hp + 0.2, zb], [x + wp / 2 + 0.2, hp + 0.2, zb])
    m.quad(ACABAMENTO, [x - wp / 2, 0, zb], [x - wp / 2 - 0.2, 0, zb], [x - wp / 2 - 0.2, hp + 0.2, zb], [x - wp / 2, hp + 0.2, zb])
    m.quad(ACABAMENTO, [x + wp / 2 + 0.2, hp, zb], [x - wp / 2 - 0.2, hp, zb], [x - wp / 2 - 0.2, hp + 0.2, zb], [x + wp / 2 + 0.2, hp + 0.2, zb])
  }
  const yM = Math.min(hp + 0.7, P - 0.6), fundo = 4, esp = 0.25
  const m0 = Math.max(-a2, portas[0] - wp / 2 - 1.5), m1 = Math.min(a2, portas[portas.length - 1] + wp / 2 + 1.5)
  const zM = -b2 - fundo
  m.quad(COBERTURA, [m1, yM, -b2], [m0, yM, -b2], [m0, yM, zM], [m1, yM, zM])
  m.quad(ACABAMENTO, [m0, yM - esp, -b2], [m1, yM - esp, -b2], [m1, yM - esp, zM], [m0, yM - esp, zM])
  m.quad(ACABAMENTO, [m1, yM - esp, zM], [m0, yM - esp, zM], [m0, yM, zM], [m1, yM, zM])
  m.quad(ACABAMENTO, [m1, yM - esp, -b2], [m1, yM - esp, zM], [m1, yM, zM], [m1, yM, -b2])
  m.quad(ACABAMENTO, [m0, yM - esp, zM], [m0, yM - esp, -b2], [m0, yM, -b2], [m0, yM, zM])

  // Pele de vidro do escritório, com marquise fina na entrada
  const zv = b2 + 0.05
  m.quad(VIDRO, [vidro[0], 0, zv], [vidro[1], 0, zv], [vidro[1], hv, zv], [vidro[0], hv, zv], wv, hv)
  m.quad(ACABAMENTO, [vidro[0] - 0.25, 0, zv + 0.02], [vidro[0], 0, zv + 0.02], [vidro[0], hv + 0.25, zv + 0.02], [vidro[0] - 0.25, hv + 0.25, zv + 0.02])
  m.quad(ACABAMENTO, [vidro[1], 0, zv + 0.02], [vidro[1] + 0.25, 0, zv + 0.02], [vidro[1] + 0.25, hv + 0.25, zv + 0.02], [vidro[1], hv + 0.25, zv + 0.02])
  m.quad(ACABAMENTO, [vidro[0], hv, zv + 0.02], [vidro[1], hv, zv + 0.02], [vidro[1], hv + 0.25, zv + 0.02], [vidro[0], hv + 0.25, zv + 0.02])
  const yE2 = Math.min(3.4, hv - 0.6), fz = zv + 2.2
  m.quad(ACABAMENTO, [vidro[0], yE2, zv], [vidro[1], yE2, zv], [vidro[1], yE2, fz], [vidro[0], yE2, fz])
  m.quad(ACABAMENTO, [vidro[0], yE2 - 0.18, fz], [vidro[1], yE2 - 0.18, fz], [vidro[1], yE2, fz], [vidro[0], yE2, fz])
  m.quad(ACABAMENTO, [vidro[1], yE2 - 0.18, zv], [vidro[0], yE2 - 0.18, zv], [vidro[0], yE2 - 0.18, fz], [vidro[1], yE2 - 0.18, fz])

  return m.montar()
}

const materiaisGalpao = new Map<string, THREE.Material[]>()

function materiaisDoGalpao(cor: string, selecionado: boolean) {
  const chave = cor + (selecionado ? '*' : '')
  const prontos = materiaisGalpao.get(chave)
  if (prontos) return prontos
  const telha = texturaTelha(), porta = texturaPorta(), concreto = texturaConcreto()
  const vidro = texturaVidro()
  vidro.repeat.set(0.8, 1 / 3)
  const lista: THREE.Material[] = [
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: cor, map: telha.mapa, normalMap: telha.normais, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.5, metalness: 0.35 }), selecionado), 1),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: '#aab1b9', map: telha.mapa, normalMap: telha.normais, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide }), selecionado), 1),
    marcar(new THREE.MeshStandardMaterial({ color: '#c4c0b8', map: concreto.mapa, normalMap: concreto.normais, roughness: 0.9 }), selecionado),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: '#6b747e', map: porta.mapa, normalMap: porta.normais, roughness: 0.45, metalness: 0.45 }), selecionado), 1),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: '#8fa0ad', map: vidro, roughness: 0.06, metalness: 0.85 }), selecionado), 1.4),
    marcar(new THREE.MeshStandardMaterial({ color: '#e3ebee', roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide }), selecionado),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: '#5f6770', roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }), selecionado), 1),
  ]
  materiaisGalpao.set(chave, lista)
  return lista
}

export function Galpao3D({ e, selecionado }: { e: Elemento; selecionado: boolean }) {
  // A cumeeira acompanha o lado maior; o vão fica no menor.
  const deitado = e.largura >= e.comprimento
  const A = Math.max(e.largura, e.comprimento), B = Math.min(e.largura, e.comprimento)
  const geo = useMemo(() => geometriaGalpao(A, B, e.altura), [A, B, e.altura])
  useEffect(() => () => geo.dispose(), [geo])
  const mats = materiaisDoGalpao(e.cor, selecionado)
  return (
    <group>
      <mesh geometry={geo} material={mats} rotation={[0, deitado ? 0 : Math.PI / 2, 0]} castShadow receiveShadow dispose={null} />
      {selecionado && <ContornoSelecao largura={e.largura} altura={e.altura} comprimento={e.comprimento} />}
    </group>
  )
}

/* ------------------------------------------------------------------ Tanques de inox */

const INOX = 0, INOX_FOSCO = 1, BASE = 2, ESCURO = 3

/** Peças de um tanque juntas numa geometria só (com grupos por material). */
function geometriaTanque(d: number, H: number) {
  const r = d / 2
  const pecas: { g: THREE.BufferGeometry; mat: number }[] = []
  const add = (g: THREE.BufferGeometry, mat: number, y: number, x = 0, z = 0) => {
    g.translate(x, y, z)
    pecas.push({ g: g.index ? g.toNonIndexed() : g, mat })
  }
  const seg = 48
  const grande = d >= 3.5
  const topo = Math.min(H * 0.25, d * (grande ? 0.14 : 0.2))
  let y0: number
  if (grande) {
    // Fundo plano sobre base de concreto
    add(new THREE.CylinderGeometry(r + 0.3, r + 0.38, 0.3, seg), BASE, 0.15)
    y0 = 0.3
  } else {
    // Fundo cônico sobre quatro pés
    const pe = Math.min(0.8, H * 0.15), cone = Math.min(r * 0.45, H * 0.1)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      add(new THREE.CylinderGeometry(0.05, 0.06, pe + cone * 0.6, 10), INOX_FOSCO, (pe + cone * 0.6) / 2, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78)
      add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12), INOX_FOSCO, 0.015, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78)
    }
    const fundo = new THREE.ConeGeometry(r, cone, seg, 1, true)
    fundo.rotateX(Math.PI)
    add(fundo, INOX, pe + cone / 2)
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 10), ESCURO, pe - 0.1)
    y0 = pe + cone
  }
  const corpo = Math.max(0.5, H - y0 - topo)
  add(new THREE.CylinderGeometry(r, r, corpo, seg, 1, true), INOX, y0 + corpo / 2)
  // Camisas de refrigeração
  for (const f of grande ? [0.5, 0.78] : [0.62]) {
    const hc = Math.min(grande ? 1.1 : 0.6, corpo * 0.15)
    add(new THREE.CylinderGeometry(r + 0.035, r + 0.035, hc, seg, 1, true), INOX_FOSCO, y0 + corpo * f)
  }
  // Tampo cônico, anel e boca de visita no alto
  add(new THREE.TorusGeometry(r, 0.035, 6, seg).rotateX(Math.PI / 2), INOX_FOSCO, y0 + corpo)
  add(new THREE.ConeGeometry(r, topo, seg, 1, true), INOX, y0 + corpo + topo / 2)
  add(new THREE.CylinderGeometry(Math.min(0.3, r * 0.3), Math.min(0.3, r * 0.3), 0.3, 20), INOX_FOSCO, y0 + corpo + topo * 0.7 + 0.15)
  // Porta oval de limpeza e válvula, na frente (x local)
  const porta = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 24)
  porta.rotateZ(Math.PI / 2)
  porta.scale(1, grande ? 1.4 : 1.1, 0.75)
  add(porta, INOX_FOSCO, y0 + (grande ? 0.75 : 0.45), r + 0.03)
  const valvula = new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10)
  valvula.rotateZ(Math.PI / 2)
  add(valvula, ESCURO, y0 + 0.25, r + 0.15, grande ? 0.9 : 0.5)

  const g = mergeGeometries(pecas.map((p) => p.g), true)!
  g.groups.forEach((gr, i) => (gr.materialIndex = pecas[i].mat))
  pecas.forEach((p) => p.g.dispose())
  return g
}

const geometriasTanque = new Map<string, THREE.BufferGeometry>()
function tanqueDe(d: number, H: number) {
  const chave = `${d.toFixed(2)}|${H.toFixed(2)}`
  let g = geometriasTanque.get(chave)
  if (!g) {
    // Esticando um tanque nascem medidas novas a cada passo: guarda só as mais recentes.
    if (geometriasTanque.size > 40) {
      const [velha, gv] = geometriasTanque.entries().next().value!
      geometriasTanque.delete(velha)
      gv.dispose()
    }
    g = geometriaTanque(d, H)
    geometriasTanque.set(chave, g)
  }
  return g
}

const materiaisTanque = new Map<string, THREE.Material[]>()
function materiaisDoTanque(cor: string, selecionado: boolean) {
  const chave = cor + (selecionado ? '*' : '')
  const prontos = materiaisTanque.get(chave)
  if (prontos) return prontos
  const escovado = texturaInox()
  const concreto = texturaConcreto()
  const lista: THREE.Material[] = [
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: cor, map: escovado, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }), selecionado), 1.6),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: cor, map: escovado, metalness: 0.9, roughness: 0.45 }), selecionado), 1.3),
    marcar(new THREE.MeshStandardMaterial({ color: '#bdb9b1', map: concreto.mapa, roughness: 0.92 }), selecionado),
    refletivo(marcar(new THREE.MeshStandardMaterial({ color: '#2f3338', roughness: 0.5, metalness: 0.5 }), selecionado), 1),
  ]
  materiaisTanque.set(chave, lista)
  return lista
}

export function Tanque3D({ e, selecionado }: { e: Elemento; selecionado: boolean }) {
  const geo = tanqueDe(e.largura, e.altura)
  return (
    <group>
      <mesh geometry={geo} material={materiaisDoTanque(e.cor, selecionado)} castShadow receiveShadow dispose={null} />
      {selecionado && (
        <mesh position={[0, e.altura / 2, 0]} raycast={() => null}>
          <cylinderGeometry args={[e.largura / 2 + 0.05, e.largura / 2 + 0.05, e.altura, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color={COR_SELECAO} lineWidth={2} threshold={30} />
        </mesh>
      )}
    </group>
  )
}
