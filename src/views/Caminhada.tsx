import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { contains, type Vec2 } from '../geo/polygon'
import { extensao } from '../data/terreno'
import { PONTO_INICIAL, useProjeto } from '../state/projeto'
import { pegada } from '../model/protecao'

type Altura = (x: number, y: number) => number

const OLHOS = 1.7 // m acima do chão
const ANDAR = 1.6 // m/s
const CORRER = 5.5
const SENSIBILIDADE = 0.0042

/** Primeiro ponto do chão na direção em que a câmera olha. */
function pontoNoChao(origem: THREE.Vector3, dir: THREE.Vector3, h: Altura): Vec2 | null {
  for (let t = 0; t < 1500; t += 1.5) {
    const x = origem.x + dir.x * t, y = -(origem.z + dir.z * t)
    if (origem.y + dir.y * t <= h(x, y)) return [x, y]
  }
  return null
}

/**
 * Andar pelo terreno em primeira pessoa: W A S D ou setas andam, arrastar olha em volta,
 * Shift corre, rolar anda para a frente. Os olhos ficam a 1,7 m do chão e não se atravessa
 * construção. `aoSair` recebe um ponto à frente, para a vista orbital continuar dali.
 */
export default function Caminhada({ h, aoSair }: { h: Altura; aoSair: (alvo: [number, number, number]) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const elementos = useProjeto((p) => p.elementos)
  const arvores = useProjeto((p) => p.arvores)
  const obstaculos = useMemo(() => elementos.map((e) => pegada({ ...e, largura: e.largura + 0.7, comprimento: e.comprimento + 0.7 })), [elementos])
  const ref = useRef({ h, obstaculos })
  ref.current = { h, obstaculos }
  const st = useRef({ yaw: 0, pitch: 0, x: 0, y: 0, teclas: new Set<string>(), arrasto: null as { x: number; y: number } | null })

  const livre = (x: number, y: number) =>
    x > extensao.minX && x < extensao.maxX && y > extensao.minY && y < extensao.maxY && !ref.current.obstaculos.some((o) => contains(o, [x, y]))

  /** Anda (dX, dY) metros na planta, escorregando pela parede quando bate. */
  const andar = (dX: number, dY: number) => {
    const s = st.current
    if (livre(s.x + dX, s.y + dY)) {
      s.x += dX
      s.y += dY
    } else if (livre(s.x + dX, s.y)) s.x += dX
    else if (livre(s.x, s.y + dY)) s.y += dY
  }

  useEffect(() => {
    const s = st.current
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    s.yaw = Math.atan2(-dir.x, -dir.z)
    s.pitch = 0
    let [x, y] = pontoNoChao(camera.position, dir, ref.current.h) ?? PONTO_INICIAL
    // Fora da foto ou no meio do mato: começa na parte aberta do terreno.
    const noMato = arvores.some((a) => Math.hypot(a.x - x, a.y - y) < 4)
    if (noMato || x < extensao.minX || x > extensao.maxX || y < extensao.minY || y > extensao.maxY) [x, y] = PONTO_INICIAL
    // Se cair dentro de uma construção, procura o chão livre mais perto.
    for (let r = 1; !livre(x, y) && r < 200; r += 1) {
      const a = r * 0.7
      if (livre(x + r * Math.cos(a), y + r * Math.sin(a))) [x, y] = [x + r * Math.cos(a), y + r * Math.sin(a)]
    }
    s.x = x
    s.y = y
    const fov0 = camera.fov, near0 = camera.near
    camera.fov = 70
    camera.near = 0.1
    camera.updateProjectionMatrix()
    camera.position.set(x, ref.current.h(x, y) + OLHOS, -y)

    const el = gl.domElement
    const apertar = (e: PointerEvent) => {
      s.arrasto = { x: e.clientX, y: e.clientY }
      el.setPointerCapture?.(e.pointerId)
    }
    const mover = (e: PointerEvent) => {
      if (!s.arrasto) return
      s.yaw -= (e.clientX - s.arrasto.x) * SENSIBILIDADE
      s.pitch = Math.max(-1.35, Math.min(1.35, s.pitch - (e.clientY - s.arrasto.y) * SENSIBILIDADE))
      s.arrasto = { x: e.clientX, y: e.clientY }
    }
    const soltar = () => (s.arrasto = null)
    const rolar = (e: WheelEvent) => {
      e.preventDefault()
      const passo = Math.max(-3, Math.min(3, -e.deltaY * 0.02))
      andar(-Math.sin(s.yaw) * passo, Math.cos(s.yaw) * passo)
    }
    const digitando = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
    const tecla = (e: KeyboardEvent) => {
      if (digitando(e) || e.metaKey || e.ctrlKey) return
      s.teclas.add(e.code)
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    }
    const largar = (e: KeyboardEvent) => s.teclas.delete(e.code)
    const limpar = () => s.teclas.clear()
    el.addEventListener('pointerdown', apertar)
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointercancel', soltar)
    el.addEventListener('wheel', rolar, { passive: false })
    window.addEventListener('keydown', tecla)
    window.addEventListener('keyup', largar)
    window.addEventListener('blur', limpar)
    return () => {
      el.removeEventListener('pointerdown', apertar)
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerup', soltar)
      el.removeEventListener('pointercancel', soltar)
      el.removeEventListener('wheel', rolar)
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('keyup', largar)
      window.removeEventListener('blur', limpar)
      camera.fov = fov0
      camera.near = near0
      camera.updateProjectionMatrix()
      camera.rotation.order = 'XYZ'
      // A vista orbital volta do alto, olhando para onde a pessoa estava.
      const fX = -Math.sin(s.yaw), fY = Math.cos(s.yaw)
      const chao = ref.current.h(s.x, s.y)
      camera.position.set(s.x - fX * 60, chao + 45, -(s.y - fY * 60))
      aoSair([s.x, chao, -s.y])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, dt) => {
    const s = st.current
    const t = s.teclas
    const tem = (...c: string[]) => c.some((k) => t.has(k))
    const frente = (tem('KeyW', 'ArrowUp') ? 1 : 0) - (tem('KeyS', 'ArrowDown') ? 1 : 0)
    const lado = (tem('KeyD', 'ArrowRight') ? 1 : 0) - (tem('KeyA', 'ArrowLeft') ? 1 : 0)
    if (frente || lado) {
      const v = (tem('ShiftLeft', 'ShiftRight') ? CORRER : ANDAR) * Math.min(dt, 0.1)
      const n = Math.hypot(frente, lado)
      // Planta: frente = (-sen, cos) do giro; direita = (cos, sen).
      const fX = -Math.sin(s.yaw), fY = Math.cos(s.yaw)
      const rX = Math.cos(s.yaw), rY = Math.sin(s.yaw)
      andar(((fX * frente + rX * lado) / n) * v, ((fY * frente + rY * lado) / n) * v)
    }
    const alvo = ref.current.h(s.x, s.y) + OLHOS
    camera.position.x = s.x
    camera.position.z = -s.y
    camera.position.y += (alvo - camera.position.y) * Math.min(1, dt * 12)
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ')
  })

  return null
}
