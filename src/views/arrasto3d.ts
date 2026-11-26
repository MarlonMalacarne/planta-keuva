import { useCallback, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

type Controles = { enabled: boolean } | null

/**
 * Arrasto no 3D fora do sistema de eventos do react-three-fiber: segue o mouse pela janela
 * inteira e trava a câmera enquanto dura. `aoMover` recebe o raio do mouse a cada movimento.
 */
export function useArrasto() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as Controles
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const raio = useCallback(
    (ev: PointerEvent | MouseEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.clone()
    },
    [camera, gl, raycaster],
  )

  const iniciar = useCallback(
    (aoMover: (raio: THREE.Ray, ev: PointerEvent) => void, aoSoltar?: () => void) => {
      if (controls) controls.enabled = false
      const mover = (ev: PointerEvent) => aoMover(raio(ev), ev)
      const soltar = () => {
        window.removeEventListener('pointermove', mover)
        window.removeEventListener('pointerup', soltar)
        window.removeEventListener('pointercancel', soltar)
        if (controls) controls.enabled = true
        aoSoltar?.()
      }
      window.addEventListener('pointermove', mover)
      window.addEventListener('pointerup', soltar)
      window.addEventListener('pointercancel', soltar)
    },
    [controls, raio],
  )

  return { iniciar, raio, camera }
}

/** Ponto onde o raio corta o plano horizontal na altura `y` (Three.js), ou null. */
export function noPlanoHorizontal(raio: THREE.Ray, y: number) {
  const p = new THREE.Vector3()
  return raio.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null
}

/** Ponto no plano vertical que passa por `ponto` e encara a câmera (para puxar alturas). */
export function noPlanoVertical(raio: THREE.Ray, ponto: THREE.Vector3, camera: THREE.Camera) {
  const n = new THREE.Vector3()
  camera.getWorldDirection(n)
  n.y = 0
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1)
  n.normalize()
  const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(n, ponto)
  const p = new THREE.Vector3()
  return raio.intersectPlane(plano, p) ? p : null
}

/** Coordenadas de planta (X leste, Y norte) de um ponto do Three.js. */
export const emPlanta = (p: THREE.Vector3): [number, number] => [p.x, -p.z]

/** Passo do encaixe: Shift deixa fino. */
export const passoDe = (ev: { shiftKey: boolean }, normal: number, fino: number) => (ev.shiftKey ? fino : normal)
