import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { areasProtegidas, terreno, extensao } from '../data/terreno'
import { centroid, type Vec2 } from '../geo/polygon'
import { useEstado } from '../state/store'
import { useElevacao, useProjeto } from '../state/projeto'
import Elementos3D from './Elementos3D'
import Arvores3D from './Arvores3D'
import Etiqueta3D from './Etiqueta3D'
import Pisos3D from './Pisos3D'
import Caminhada from './Caminhada'
import { Footprints, LogOut } from 'lucide-react'
import { geometriaNoChao } from './chao3d'
import { concluirPiso, marcarCanto } from '../state/desenho'
import { areaInvadida, pegada } from '../model/protecao'

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
  const ferramenta = useEstado((e) => e.ferramenta)
  const elevacao = useElevacao()
  const { adicionarCota, selecionar } = useProjeto()
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
    <mesh
      geometry={geo}
      receiveShadow
      onDoubleClick={() => ferramenta === 'piso' && concluirPiso()}
      onClick={(ev) => {
        if (ev.delta > 4 || useEstado.getState().caminhando) return // foi um arrasto de câmera
        if (ferramenta === 'piso') marcarCanto([ev.point.x, -ev.point.z], 1.2)
        else if (ferramenta === 'cota') {
          const x = ev.point.x, y = -ev.point.z
          adicionarCota(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(elevacao.at(x, y) * 1000) / 1000)
        } else selecionar(null)
      }}
    >
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

/** Superfície translúcida que acompanha o relevo (recuo, reserva...). */
function AreaNoChao({ pts, cor, opacidade }: { pts: Vec2[]; cor: string; opacidade: number }) {
  const h = useAltura()
  const geo = useMemo(() => geometriaNoChao(pts, h, 0.12), [pts, h])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshBasicMaterial color={cor} transparent opacity={opacidade} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
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
              <meshStandardMaterial color="#ff5a5f" />
            </mesh>
            <Rotulo texto={nome} posicao={[0, 2.6, 0]} />
          </group>
        )
      })}
    </group>
  )
}

/** Etiqueta desenhada em textura (sem DOM), com tamanho fixo na tela. */
function Rotulo({ texto, posicao, cor = '#ff5a5f' }: { texto: string; posicao: [number, number, number]; cor?: string }) {
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
  const selecao = useProjeto((p) => p.selecao)
  const selecionar = useProjeto((p) => p.selecionar)
  const selecionada = selecao?.tipo === 'cota' ? selecao.id : null
  return (
    <group>
      {cotas.map((c) => (
        <mesh
          key={c.id}
          position={[c.x, h(c.x, c.y) + 0.3, -c.y]}
          scale={c.id === selecionada ? 2 : 1}
          onClick={(ev) => {
            ev.stopPropagation()
            selecionar({ tipo: 'cota', id: c.id })
          }}
        >
          <sphereGeometry args={[0.45, 10, 8]} />
          <meshStandardMaterial color={c.origem === 'manual' ? '#5ce1e6' : '#ffd166'} emissive={c.origem === 'manual' ? '#0b5a5c' : '#7a5a00'} />
        </mesh>
      ))}
    </group>
  )
}

/** Só no desenvolvimento: deixa a cena acessível para os testes no navegador. */
function Depuracao() {
  const estado = useThree()
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __cena?: unknown }).__cena = estado
  }, [estado])
  return null
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

/** Construções não são exageradas na vertical: só o chão sob elas acompanha o exagero. */
function ElementosNoTerreno() {
  return <Elementos3D h={useAltura()} />
}

function ArvoresNoTerreno() {
  return <Arvores3D h={useAltura()} />
}

function PisosNoTerreno() {
  return <Pisos3D h={useAltura()} />
}

function CaminhadaNoTerreno({ aoSair }: { aoSair: (alvo: [number, number, number]) => void }) {
  return <Caminhada h={useAltura()} aoSair={aoSair} />
}

/** Reserva legal e compensação (verde, não se constrói) e a supressão autorizada (tracejada). */
function AreasProtegidas() {
  const h = useAltura()
  return (
    <group>
      <LinhaNoChao pts={terreno.supressao.poligono} cor="#f0b070" largura={2} fechada tracejada />
      {areasProtegidas.map((a) => {
        const [x, y] = centroid(a.poligono)
        return (
          <group key={a.id}>
            <AreaNoChao pts={a.poligono} cor="#2fbf6a" opacidade={0.3} />
            <LinhaNoChao pts={a.poligono} cor="#3fd27a" largura={3} fechada />
            <Etiqueta3D texto={`${a.curto} · não construir`} posicao={[x, h(x, y) + 22, -y]} fundo="rgba(22, 92, 52, 0.85)" altura={0.026} />
          </group>
        )
      })}
    </group>
  )
}

/** Contorno vermelho em volta de elemento que ficou dentro de área protegida. */
function Invasoes() {
  const elementos = useProjeto((p) => p.elementos)
  return (
    <group>
      {elementos.filter((e) => areaInvadida(e)).map((e) => (
        <LinhaNoChao key={e.id} pts={pegada({ ...e, largura: e.largura + 1.5, comprimento: e.comprimento + 1.5 })} cor="#ff5a5f" largura={4} fechada />
      ))}
    </group>
  )
}

export default function Scene3D() {
  const camadas = useEstado((e) => e.camadas)
  const ferramenta = useEstado((e) => e.ferramenta)
  const caminhando = useEstado((e) => e.caminhando)
  const selecionar = useProjeto((p) => p.selecionar)
  const [alvoOrbita, setAlvoOrbita] = useState<[number, number, number]>([centro[0], 5, -centro[1]])
  // Saindo do 3D (ou do app), a caminhada acaba.
  useEffect(() => () => useEstado.getState().setCaminhando(false), [])
  const caminhar = () => {
    useEstado.getState().setFerramenta('selecionar')
    selecionar(null)
    useEstado.getState().setCaminhando(true)
  }
  return (
    <div className={`scene3d ${caminhando ? 'caminhando' : ''}`}>
      <Canvas onPointerMissed={() => selecionar(null)} className={ferramenta === 'cota' ? 'cursor-cota' : ''} shadows camera={{ fov: 45, near: 0.5, far: 5000 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <CameraInicial />
        <Depuracao />
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
        {camadas.divisas && <LinhaNoChao pts={terreno.perimetro} cor="#ff5a5f" largura={3} fechada />}
        {camadas.divisas && <Marcos />}
        {camadas.recuo && <AreaNoChao pts={terreno.recuo.poligono} cor="#ffb020" opacidade={0.35} />}
        {camadas.mata && <AreasProtegidas />}
        {camadas.mata && <ArvoresNoTerreno />}
        <Invasoes />
        <PisosNoTerreno />
        {(camadas.relevo || ferramenta === 'cota') && <Cotas />}
        <ElementosNoTerreno />
        {caminhando ? (
          <CaminhadaNoTerreno aoSair={setAlvoOrbita} />
        ) : (
          <OrbitControls makeDefault target={alvoOrbita} maxPolarAngle={Math.PI / 2.05} minDistance={5} maxDistance={1200} enableDamping />
        )}
      </Canvas>
      {caminhando ? (
        <div className="hud-caminhada vidro" role="status">
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> ou setas andam
          </span>
          <span>Arraste para olhar</span>
          <span>
            <kbd>Shift</kbd> corre
          </span>
          <button className="botao-secundario" onClick={() => useEstado.getState().setCaminhando(false)} title="Sair (Esc)">
            <LogOut size={15} /> Sair
          </button>
        </div>
      ) : (
        <div className="scene3d-sobre">
          <button className="botao-flutuante" onClick={caminhar} title="Andar pelo terreno em primeira pessoa">
            <Footprints size={15} /> Caminhar
          </button>
        </div>
      )}

    </div>
  )
}
