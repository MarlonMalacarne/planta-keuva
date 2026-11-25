import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { terreno, extensao } from '../data/terreno'
import { centroid, rng, scatter, type Vec2 } from '../geo/polygon'
import { useEstado } from '../state/store'
import { useElevacao, useProjeto } from '../state/projeto'

/** Cota de referência: o 3D trabalha com alturas relativas a ela. */
export const COTA_BASE = 770

const centro = centroid(terreno.perimetro)

/** Mundo (X leste, Y norte, Z cota) → Three.js (x, y para cima, z para o sul). */
function useAltura() {
  const ex = useEstado((e) => e.exagero)
  const elevacao = useElevacao()
  return useMemo(() => (x: number, y: number) => (elevacao.at(x, y) - COTA_BASE) * ex, [ex, elevacao])
}

function Terreno() {
  const h = useAltura()
  const foto = useEstado((e) => e.camadas.foto)
  const textura = useMemo(() => {
    const t = new THREE.TextureLoader().load(terreno.fotoAerea.arquivo)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])

  const geo = useMemo(() => {
    const e = extensao
    const passo = 2
    const nx = Math.ceil((e.maxX - e.minX) / passo) + 1
    const ny = Math.ceil((e.maxY - e.minY) / passo) + 1
    const pos = new Float32Array(nx * ny * 3)
    const uv = new Float32Array(nx * ny * 2)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = Math.min(e.minX + i * passo, e.maxX)
        const y = Math.min(e.minY + j * passo, e.maxY)
        const k = j * nx + i
        pos.set([x, h(x, y), -y], k * 3)
        uv.set([(x - e.minX) / (e.maxX - e.minX), (y - e.minY) / (e.maxY - e.minY)], k * 2)
      }
    }
    const idx: number[] = []
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
        idx.push(a, b, d, a, d, c)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [h])

  useEffect(() => () => geo.dispose(), [geo])

  // Fica abaixo do ponto mais baixo do terreno, para nunca cobri-lo.
  const borda = useMemo(() => {
    const pos = geo.getAttribute('position')
    let min = Infinity
    for (let i = 0; i < pos.count; i++) min = Math.min(min, pos.getY(i))
    return min - 0.6
  }, [geo])

  return (
    <group>
    {/* Chão do entorno, para o modelo não "flutuar" no vazio. */}
    <mesh rotation-x={-Math.PI / 2} position={[(extensao.minX + extensao.maxX) / 2, borda, -(extensao.minY + extensao.maxY) / 2]} receiveShadow>
      <planeGeometry args={[4000, 4000]} />
      <meshStandardMaterial color="#7d8f5c" roughness={1} />
    </mesh>
    <mesh geometry={geo} receiveShadow>
      {foto ? (
        <meshStandardMaterial map={textura} roughness={0.95} metalness={0} />
      ) : (
        <meshStandardMaterial color="#6f8f4e" roughness={1} />
      )}
    </mesh>
    </group>
  )
}

/** Linha que acompanha o relevo, levemente acima do chão. */
function LinhaNoChao({ pts, cor, largura = 3, fechada = false, tracejada = false }: { pts: Vec2[]; cor: string; largura?: number; fechada?: boolean; tracejada?: boolean }) {
  const h = useAltura()
  const pontos = useMemo(() => {
    const lista = fechada ? [...pts, pts[0]] : pts
    const out: [number, number, number][] = []
    for (let i = 0; i < lista.length - 1; i++) {
      const [ax, ay] = lista[i], [bx, by] = lista[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2))
      for (let k = 0; k < n; k++) {
        const t = k / n
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t
        out.push([x, h(x, y) + 0.25, -y])
      }
    }
    const [lx, ly] = lista[lista.length - 1]
    out.push([lx, h(lx, ly) + 0.25, -ly])
    return out
  }, [pts, h, fechada])
  return <Line points={pontos} color={cor} lineWidth={largura} dashed={tracejada} dashSize={2} gapSize={1.2} />
}

/** Superfície translúcida que acompanha o relevo (para o recuo). */
function AreaNoChao({ pts, cor, opacidade }: { pts: Vec2[]; cor: string; opacidade: number }) {
  const h = useAltura()
  const geo = useMemo(() => {
    const contorno = pts.map(([x, y]) => new THREE.Vector2(x, y))
    const tri = THREE.ShapeUtils.triangulateShape(contorno, [])
    const pos = new Float32Array(pts.length * 3)
    pts.forEach(([x, y], i) => pos.set([x, h(x, y) + 0.12, -y], i * 3))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setIndex(tri.flat())
    return g
  }, [pts, h])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshBasicMaterial color={cor} transparent opacity={opacidade} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}

/** Mata nativa: árvores instanciadas com altura, copa e tom variados. */
function Mata() {
  const h = useAltura()
  const ex = useEstado((e) => e.exagero)
  const troncos = useRef<THREE.InstancedMesh>(null)
  const copas = useRef<THREE.InstancedMesh>(null)
  const pontos = useMemo(() => scatter(terreno.mata.poligono, 5.5, 42), [])

  useEffect(() => {
    const r = rng(7)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const cor = new THREE.Color()
    pontos.forEach(([x, y], i) => {
      const alt = 7 + r() * 9
      const raio = 2.2 + r() * 2.4
      const base = h(x, y)
      q.setFromEuler(new THREE.Euler(0, r() * Math.PI * 2, 0))
      m.compose(new THREE.Vector3(x, base + alt * 0.3, -y), q, new THREE.Vector3(0.25 + r() * 0.15, alt * 0.6, 0.25 + r() * 0.15))
      troncos.current!.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, base + alt * 0.72, -y), q, new THREE.Vector3(raio, raio * (0.75 + r() * 0.35), raio))
      copas.current!.setMatrixAt(i, m)
      cor.setHSL(0.26 + r() * 0.08, 0.35 + r() * 0.25, 0.2 + r() * 0.14)
      copas.current!.setColorAt(i, cor)
    })
    troncos.current!.instanceMatrix.needsUpdate = true
    copas.current!.instanceMatrix.needsUpdate = true
    if (copas.current!.instanceColor) copas.current!.instanceColor.needsUpdate = true
  }, [pontos, h, ex])

  return (
    <group>
      <instancedMesh ref={troncos} args={[undefined, undefined, pontos.length]} castShadow>
        <cylinderGeometry args={[1, 1.3, 1, 6]} />
        <meshStandardMaterial color="#5b4636" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={copas} args={[undefined, undefined, pontos.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

function Marcos() {
  const h = useAltura()
  return (
    <group>
      {Object.entries(terreno.vertices).map(([nome, [x, y]]) => {
        const z = h(x, y)
        return (
          <group key={nome} position={[x, z, -y]}>
            <mesh position={[0, 0.6, 0]} castShadow>
              <boxGeometry args={[0.15, 1.2, 0.15]} />
              <meshStandardMaterial color="#e63946" />
            </mesh>
            <Rotulo texto={nome} posicao={[0, 2.6, 0]} />
          </group>
        )
      })}
    </group>
  )
}

/** Etiqueta desenhada em textura (sem DOM), com tamanho fixo na tela. */
function Rotulo({ texto, posicao, cor = '#e63946' }: { texto: string; posicao: [number, number, number]; cor?: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = cor
    g.beginPath()
    g.roundRect(4, 4, 56, 56, 12)
    g.fill()
    g.fillStyle = '#fff'
    g.font = 'bold 40px -apple-system, Helvetica, Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, 32, 35)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [texto, cor])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <sprite position={posicao} scale={[0.024, 0.024, 1]} renderOrder={10}>
      <spriteMaterial map={tex} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  )
}

function Cotas() {
  const h = useAltura()
  const cotas = useProjeto((p) => p.cotas)
  const selecionada = useProjeto((p) => p.selecionada)
  return (
    <group>
      {cotas.map((c) => (
        <mesh key={c.id} position={[c.x, h(c.x, c.y) + 0.3, -c.y]} scale={c.id === selecionada ? 2 : 1}>
          <sphereGeometry args={[0.45, 10, 8]} />
          <meshStandardMaterial color={c.origem === 'manual' ? '#5ce1e6' : '#ffd166'} emissive={c.origem === 'manual' ? '#0b5a5c' : '#7a5a00'} />
        </mesh>
      ))}
    </group>
  )
}

function CameraInicial() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(centro[0] - 140, 120, -centro[1] + 170)
    camera.lookAt(centro[0], 0, -centro[1])
  }, [camera])
  return null
}

const SOL = new THREE.Vector3(120, 160, 80)

export default function Scene3D() {
  const camadas = useEstado((e) => e.camadas)
  return (
    <div className="scene3d">
      <Canvas shadows camera={{ fov: 45, near: 0.5, far: 5000 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <CameraInicial />
        <Sky sunPosition={SOL.toArray()} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} />
        <fog attach="fog" args={['#c9d8e6', 400, 1400]} />
        <hemisphereLight args={['#dfeaff', '#4b5a3a', 0.8]} />
        <directionalLight
          position={[centro[0] + SOL.x, SOL.y, -centro[1] + SOL.z]}
          target-position={[centro[0], 0, -centro[1]]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-180}
          shadow-camera-right={180}
          shadow-camera-top={180}
          shadow-camera-bottom={-180}
          shadow-camera-far={800}
          shadow-bias={-0.0004}
        />
        <Terreno />
        {camadas.perimetro && <LinhaNoChao pts={terreno.perimetro} cor="#e63946" largura={3} fechada />}
        {camadas.perimetro && <Marcos />}
        {camadas.recuo && <AreaNoChao pts={terreno.recuo.poligono} cor="#ff9f1c" opacidade={0.35} />}
        {camadas.mata && !camadas.arvores && <LinhaNoChao pts={terreno.mata.poligono} cor="#2f8f46" largura={2} fechada tracejada />}
        {camadas.mata && camadas.arvores && <Mata />}
        {camadas.cotas && <Cotas />}
        <OrbitControls makeDefault target={[centro[0], 5, -centro[1]]} maxPolarAngle={Math.PI / 2.05} minDistance={5} maxDistance={1200} enableDamping />
      </Canvas>
      <div className="dica-3d">Arraste para girar · botão direito para mover · role para aproximar</div>
    </div>
  )
}
