import { useMemo, useRef, useState } from 'react'
import { Edges, Line } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEstado } from '../state/store'
import { useProjeto } from '../state/projeto'
import { anguloEm, contorno, difAngulo, direcaoLado, esticar, esticarAltura, girar, type Elemento, type Lado } from '../model/elementos'
import { emPlanta, noPlanoHorizontal, noPlanoVertical, passoDe, useArrasto } from './arrasto3d'
import Etiqueta3D from './Etiqueta3D'

const COR_SELECAO = '#5b8cff'
const arred = (v: number, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas
const metros = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m'

/** Altura do chão sob o elemento: média dos cantos e do centro. */
function useBase(e: Elemento, h: (x: number, y: number) => number) {
  return useMemo(() => {
    const pts = [...contorno(e), [e.x, e.y] as [number, number]]
    return pts.reduce((s, [x, y]) => s + h(x, y), 0) / pts.length
  }, [e, h])
}

function Material({ cor, selecionado }: { cor: string; selecionado: boolean }) {
  return <meshStandardMaterial color={cor} roughness={0.75} metalness={0.05} emissive={selecionado ? COR_SELECAO : '#000'} emissiveIntensity={selecionado ? 0.12 : 0} />
}

/** Geometria de cada tipo, com a base em y = 0 e centro em (0, 0). */
function Forma({ e, selecionado }: { e: Elemento; selecionado: boolean }) {
  const contornoSel = selecionado ? <Edges color={COR_SELECAO} lineWidth={2} threshold={15} /> : null
  switch (e.tipo) {
    case 'galpao': {
      const parede = e.altura * 0.72
      const cumeeira = e.altura - parede
      return (
        <group>
          <mesh position={[0, parede / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[e.largura, parede, e.comprimento]} />
            <Material cor={e.cor} selecionado={selecionado} />
            {contornoSel}
          </mesh>
          <Telhado largura={e.largura} comprimento={e.comprimento} altura={cumeeira} base={parede} selecionado={selecionado} />
        </group>
      )
    }
    case 'tanque':
      return (
        <group>
          <mesh position={[0, e.altura / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[e.largura / 2, e.largura / 2, e.altura, 40]} />
            <meshStandardMaterial color={e.cor} roughness={0.35} metalness={0.55} emissive={selecionado ? COR_SELECAO : '#000'} emissiveIntensity={selecionado ? 0.12 : 0} />
            {contornoSel}
          </mesh>
          <mesh position={[0, e.altura + e.largura * 0.08, 0]} castShadow>
            <coneGeometry args={[e.largura / 2, e.largura * 0.16, 40]} />
            <meshStandardMaterial color={e.cor} roughness={0.35} metalness={0.55} />
          </mesh>
        </group>
      )
    case 'predio':
      return (
        <group>
          <mesh position={[0, e.altura / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[e.largura, e.altura, e.comprimento]} />
            <Material cor={e.cor} selecionado={selecionado} />
            {contornoSel}
          </mesh>
          {/* Faixas de janelas a cada pavimento de ~3,5 m */}
          {Array.from({ length: Math.max(1, Math.floor(e.altura / 3.5)) }, (_, i) => (
            <mesh key={i} position={[0, Math.min(1.6 + i * 3.5, e.altura - 0.7), 0]}>
              <boxGeometry args={[e.largura + 0.04, Math.min(1.2, e.altura * 0.4), e.comprimento + 0.04]} />
              <meshStandardMaterial color="#2c3e50" roughness={0.15} metalness={0.6} transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      )
    default:
      return (
        <mesh position={[0, e.altura / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[e.largura, e.altura, e.comprimento]} />
          <Material cor={e.cor} selecionado={selecionado} />
          {contornoSel}
        </mesh>
      )
  }
}

function Telhado({ largura, comprimento, altura, base, selecionado }: { largura: number; comprimento: number; altura: number; base: number; selecionado: boolean }) {
  const geo = useMemo(() => {
    const beiral = 0.6
    const s = new THREE.Shape()
    s.moveTo(-largura / 2 - beiral, 0)
    s.lineTo(largura / 2 + beiral, 0)
    s.lineTo(0, altura)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: comprimento + beiral * 2, bevelEnabled: false })
    g.translate(0, 0, -(comprimento + beiral * 2) / 2)
    return g
  }, [largura, comprimento, altura])
  return (
    <mesh geometry={geo} position={[0, base, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#b4bcc6" roughness={0.45} metalness={0.5} emissive={selecionado ? COR_SELECAO : '#000'} emissiveIntensity={selecionado ? 0.1 : 0} />
    </mesh>
  )
}

/** Mantém o filho com o mesmo tamanho na tela, qualquer que seja a distância da câmera. */
function TamanhoFixo({ children, fator = 0.03, position }: { children: React.ReactNode; fator?: number; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  const p = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g) return
    g.getWorldPosition(p)
    g.scale.setScalar(camera.position.distanceTo(p) * fator)
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

const materialAlca = (cor: string, opacidade = 1) => <meshBasicMaterial color={cor} depthTest={false} depthWrite={false} transparent opacity={opacidade} toneMapped={false} />
const alvoInvisivel = <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />

type Etiqueta = { texto: string; pos: [number, number, number] } | null

/** Seta que puxa uma face (estilo Shapr3D). `dir` é a direção local para onde ela aponta. */
function AlcaFace({ nome, pos, dir, onApertar, rotulo }: { nome: string; pos: [number, number, number]; dir: [number, number, number]; onApertar: (ev: ThreeEvent<PointerEvent>) => void; rotulo: string }) {
  const [sobre, setSobre] = useState(false)
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir)), [dir])
  const cor = sobre ? '#ffffff' : COR_SELECAO
  return (
    <group position={pos}>
      <TamanhoFixo position={[0, 0, 0]}>
        <group quaternion={q}>
          <mesh position={[0, 0.25, 0]} renderOrder={11}>
            <sphereGeometry args={[0.26, 16, 12]} />
            {materialAlca('#ffffff')}
          </mesh>
          <mesh position={[0, 0.25, 0]} renderOrder={12}>
            <sphereGeometry args={[0.18, 16, 12]} />
            {materialAlca(cor)}
          </mesh>
          <mesh position={[0, 0.62, 0]} renderOrder={11}>
            <cylinderGeometry args={[0.06, 0.06, 0.5, 8]} />
            {materialAlca(cor)}
          </mesh>
          <mesh position={[0, 1.02, 0]} renderOrder={11}>
            <coneGeometry args={[0.22, 0.42, 20]} />
            {materialAlca(cor)}
          </mesh>
          <mesh
            position={[0, 0.65, 0]}
            userData={{ alca: nome }}
            onPointerDown={onApertar}
            onClick={(ev) => ev.stopPropagation()}
            onPointerOver={(ev) => {
              ev.stopPropagation()
              setSobre(true)
              document.body.style.cursor = 'grab'
            }}
            onPointerOut={() => {
              setSobre(false)
              document.body.style.cursor = ''
            }}
          >
            <cylinderGeometry args={[0.36, 0.36, 1.35, 10]} />
            {alvoInvisivel}
          </mesh>
        </group>
      </TamanhoFixo>
      {sobre && <Etiqueta3D texto={rotulo} posicao={[0, 0, 0]} altura={0.026} />}
    </group>
  )
}

/** Anel de giro em volta do elemento, com um puxador. */
function AlcaGiro({ raio, angulo, onApertar, rotulo }: { raio: number; angulo: number; onApertar: (ev: ThreeEvent<PointerEvent>) => void; rotulo: string }) {
  const [sobre, setSobre] = useState(false)
  const pontos = useMemo(() => Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * raio, 0.25, Math.sin((i / 96) * Math.PI * 2) * raio)), [raio])
  const puxador: [number, number, number] = [Math.cos(angulo) * raio, 0.25, -Math.sin(angulo) * raio]
  const eventos = {
    userData: { alca: 'giro' },
    onPointerDown: onApertar,
    onClick: (ev: ThreeEvent<MouseEvent>) => ev.stopPropagation(),
    onPointerOver: (ev: ThreeEvent<PointerEvent>) => {
      ev.stopPropagation()
      setSobre(true)
      document.body.style.cursor = 'grab'
    },
    onPointerOut: () => {
      setSobre(false)
      document.body.style.cursor = ''
    },
  }
  return (
    <group>
      <Line points={pontos} color={sobre ? '#ffffff' : COR_SELECAO} lineWidth={sobre ? 3 : 2} transparent opacity={0.9} depthTest={false} renderOrder={10} />
      {/* Faixa invisível para pegar o anel em qualquer ponto */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.25, 0]} {...eventos} userData={{ alca: 'anel' }}>
        <ringGeometry args={[raio - Math.max(0.6, raio * 0.04), raio + Math.max(0.6, raio * 0.04), 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <TamanhoFixo position={puxador}>
        <mesh renderOrder={12}>
          <sphereGeometry args={[0.34, 20, 14]} />
          {materialAlca('#ffffff')}
        </mesh>
        <mesh renderOrder={13}>
          <sphereGeometry args={[0.24, 20, 14]} />
          {materialAlca(sobre ? '#ffffff' : '#ffb020')}
        </mesh>
        <mesh {...eventos}>
          <sphereGeometry args={[0.55, 10, 8]} />
          {alvoInvisivel}
        </mesh>
      </TamanhoFixo>
      {sobre && <Etiqueta3D texto={rotulo} posicao={puxador} altura={0.026} />}
    </group>
  )
}

function ElementoNoTerreno({ e, h, selecionado }: { e: Elemento; h: (x: number, y: number) => number; selecionado: boolean }) {
  const base = useBase(e, h)
  const { selecionar, editarElemento, marcar } = useProjeto.getState()
  const ferramenta = useEstado((s) => s.ferramenta)
  const { iniciar, camera } = useArrasto()
  const grupo = useRef<THREE.Group>(null)
  const [etiqueta, setEtiqueta] = useState<Etiqueta>(null)
  const caminhando = useEstado((s) => s.caminhando)
  const editando = ferramenta === 'selecionar' && !caminhando

  /** Começa um arrasto: guarda o desfazer só quando algo muda de fato. */
  const arrastar = (aplicar: (raio: THREE.Ray, ev: PointerEvent) => void) => {
    let marcado = false
    iniciar(
      (raio, ev) => {
        if (!marcado) {
          marcar()
          marcado = true
        }
        aplicar(raio, ev)
      },
      () => {
        setEtiqueta(null)
        document.body.style.cursor = ''
      },
    )
  }

  // Mover: arrastar o próprio elemento (quando já está selecionado).
  const aoApertarCorpo = (ev: ThreeEvent<PointerEvent>) => {
    if (!editando || !selecionado || ev.button !== 0) return
    if (ev.intersections.some((i) => i.object.userData?.alca)) return // a alça tem prioridade
    ev.stopPropagation()
    const p0 = noPlanoHorizontal(ev.ray, base)
    if (!p0) return
    const e0 = e
    document.body.style.cursor = 'grabbing'
    arrastar((raio, pe) => {
      const p = noPlanoHorizontal(raio, base)
      if (!p) return
      const passo = passoDe(pe, 0.5, 0.05)
      const x = arred(Math.round((e0.x + p.x - p0.x) / passo) * passo)
      const y = arred(Math.round((e0.y - (p.z - p0.z)) / passo) * passo)
      editarElemento(e0.id, { x, y }, false)
      setEtiqueta({ texto: `X ${metros(x)} · Y ${metros(y)}`, pos: [0, e0.altura + 2, 0] })
    })
  }

  const aoApertarFace = (lado: Lado) => (ev: ThreeEvent<PointerEvent>) => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    const e0 = e
    const alturaPlano = base + alturaAlcas(e0)
    const p0 = noPlanoHorizontal(ev.ray, alturaPlano)
    if (!p0) return
    const dir = direcaoLado(e0, lado)
    const [x0, y0] = emPlanta(p0)
    document.body.style.cursor = 'grabbing'
    arrastar((raio, pe) => {
      const p = noPlanoHorizontal(raio, alturaPlano)
      if (!p) return
      const [x1, y1] = emPlanta(p)
      const d = (x1 - x0) * dir[0] + (y1 - y0) * dir[1]
      const novo = { ...e0, ...esticar(e0, lado, d, passoDe(pe, 0.5, 0.05)) }
      editarElemento(e0.id, novo, false)
      setEtiqueta({ texto: rotuloLado(novo, lado), pos: posicaoLado(novo, lado, 2.5) })
    })
  }

  const aoApertarTopo = (ev: ThreeEvent<PointerEvent>) => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    const e0 = e
    const ponto = new THREE.Vector3(e0.x, base + e0.altura, -e0.y)
    const p0 = noPlanoVertical(ev.ray, ponto, camera)
    if (!p0) return
    document.body.style.cursor = 'grabbing'
    arrastar((raio, pe) => {
      const p = noPlanoVertical(raio, ponto, camera)
      if (!p) return
      const novo = { ...e0, ...esticarAltura(e0, p.y - p0.y, passoDe(pe, 0.5, 0.05)) }
      editarElemento(e0.id, novo, false)
      setEtiqueta({ texto: `Altura ${metros(novo.altura)}`, pos: [0, novo.altura + 3, 0] })
    })
  }

  const aoApertarGiro = (ev: ThreeEvent<PointerEvent>) => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    const e0 = e
    const p0 = noPlanoHorizontal(ev.ray, base + 0.25)
    if (!p0) return
    let ultimo = anguloEm(e0, emPlanta(p0))
    let varrido = 0
    document.body.style.cursor = 'grabbing'
    arrastar((raio, pe) => {
      const p = noPlanoHorizontal(raio, base + 0.25)
      if (!p) return
      const a = anguloEm(e0, emPlanta(p))
      varrido += difAngulo(ultimo, a)
      ultimo = a
      const novo = girar(e0, varrido, passoDe(pe, 5, 1))
      editarElemento(e0.id, novo, false)
      setEtiqueta({ texto: `Giro ${(novo.rot ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}°`, pos: [0, 1.5, 0] })
    })
  }

  // O puxador de giro nasce do lado do anel voltado para a câmera (fica à frente, longe das setas)
  // e depois gira junto com o elemento.
  const anguloPuxador = useMemo(
    () => Math.atan2(-camera.position.z - e.y, camera.position.x - e.x) - (e.rot * Math.PI) / 180 + 0.6,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selecionado, camera],
  )
  const meia = Math.hypot(e.largura, e.comprimento) / 2
  const raioGiro = (e.tipo === 'tanque' ? e.largura / 2 : meia) + Math.max(2, meia * 0.15)
  const lados: Lado[] = ['x+', 'x-', 'y+', 'y-']

  return (
    <group
      ref={grupo}
      position={[e.x, base, -e.y]}
      rotation={[0, (e.rot * Math.PI) / 180, 0]}
      onClick={(ev: ThreeEvent<MouseEvent>) => {
        if (!editando || ev.delta > 4) return
        ev.stopPropagation()
        selecionar({ tipo: 'elemento', id: e.id })
      }}
      onPointerOver={(ev) => {
        ev.stopPropagation()
        if (!document.body.style.cursor) document.body.style.cursor = selecionado ? 'move' : 'pointer'
      }}
      onPointerOut={() => {
        if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = ''
      }}
    >
      <group onPointerDown={aoApertarCorpo}>
        <Forma e={e} selecionado={selecionado} />
        {/* Fundação: esconde a folga entre o piso e o terreno em declive */}
        {e.tipo !== 'tanque' && (
          <mesh position={[0, -1.5 + 0.01, 0]} receiveShadow>
            <boxGeometry args={[e.largura + 0.3, 3, e.comprimento + 0.3]} />
            <meshStandardMaterial color="#9a958c" roughness={1} />
          </mesh>
        )}
      </group>

      {selecionado && editando && (
        <group>
          {lados.map((lado) => (
            <AlcaFace key={lado} nome={lado} pos={posicaoLado(e, lado, 0)} dir={dirLocal(lado)} onApertar={aoApertarFace(lado)} rotulo={rotuloLado(e, lado)} />
          ))}
          <AlcaFace nome="topo" pos={[0, e.altura, 0]} dir={[0, 1, 0]} onApertar={aoApertarTopo} rotulo={`Altura ${metros(e.altura)}`} />
          <AlcaGiro raio={raioGiro} angulo={anguloPuxador} onApertar={aoApertarGiro} rotulo={`Giro ${e.rot.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}°`} />
        </group>
      )}
      {etiqueta && <Etiqueta3D texto={etiqueta.texto} posicao={etiqueta.pos} />}
    </group>
  )
}

/** Altura (sobre a base) em que ficam as setas laterais. */
function alturaAlcas(e: Elemento) {
  return e.tipo === 'galpao' ? e.altura * 0.36 : e.altura / 2
}

/** Direção local (Three.js) de cada face. O eixo y da planta é o -z do Three.js. */
function dirLocal(lado: Lado): [number, number, number] {
  return { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 0, -1], 'y-': [0, 0, 1] }[lado] as [number, number, number]
}

function posicaoLado(e: Elemento, lado: Lado, folga: number): [number, number, number] {
  const [dx, , dz] = dirLocal(lado)
  const meio = lado[0] === 'x' ? e.largura / 2 : e.comprimento / 2
  return [dx * (meio + folga), alturaAlcas(e), dz * (meio + folga)]
}

function rotuloLado(e: Elemento, lado: Lado) {
  if (e.tipo === 'tanque') return `Diâmetro ${metros(e.largura)}`
  if (lado[0] === 'x') return `${e.tipo === 'muro' ? 'Espessura' : 'Largura'} ${metros(e.largura)}`
  return `Comprimento ${metros(e.comprimento)}`
}

export default function Elementos3D({ h }: { h: (x: number, y: number) => number }) {
  const elementos = useProjeto((p) => p.elementos)
  const selecao = useProjeto((p) => p.selecao)
  const sel = selecao?.tipo === 'elemento' ? selecao.id : null
  return (
    <group>
      {elementos.map((e) => (
        <ElementoNoTerreno key={e.id} e={e} h={h} selecionado={e.id === sel} />
      ))}
    </group>
  )
}
