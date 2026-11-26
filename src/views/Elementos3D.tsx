import { useMemo, useRef, useState } from 'react'
import { Edges, TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEstado } from '../state/store'
import { useProjeto } from '../state/projeto'
import { contorno, type Elemento } from '../model/elementos'

const COR_SELECAO = '#5b8cff'
/** Rumo (giro em torno do eixo vertical) do objeto, em graus 0–360. */
function rumo(o: THREE.Object3D) {
  const v = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
  const g = (Math.atan2(-v.z, v.x) * 180) / Math.PI
  return (g + 360) % 360
}
const arred = (v: number, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas

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
            <mesh key={i} position={[0, 1.6 + i * 3.5, 0]}>
              <boxGeometry args={[e.largura + 0.04, 1.2, e.comprimento + 0.04]} />
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

function ElementoNoTerreno({ e, h, selecionado, registrar }: { e: Elemento; h: (x: number, y: number) => number; selecionado: boolean; registrar: (o: THREE.Object3D | null) => void }) {
  const base = useBase(e, h)
  const selecionar = useProjeto((p) => p.selecionar)
  const ferramenta = useEstado((s) => s.ferramenta)
  const fundacao = 3
  return (
    <group
      ref={selecionado ? registrar : undefined}
      position={[e.x, base, -e.y]}
      rotation={[0, (e.rot * Math.PI) / 180, 0]}
      onClick={(ev: ThreeEvent<MouseEvent>) => {
        if (ferramenta === 'cota' || ev.delta > 4) return
        ev.stopPropagation()
        selecionar({ tipo: 'elemento', id: e.id })
      }}
      onPointerOver={(ev) => { ev.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <Forma e={e} selecionado={selecionado} />
      {/* Fundação: esconde a folga entre o piso e o terreno em declive */}
      {e.tipo !== 'tanque' && (
        <mesh position={[0, -fundacao / 2 + 0.01, 0]} receiveShadow>
          <boxGeometry args={[e.largura + 0.3, fundacao, e.comprimento + 0.3]} />
          <meshStandardMaterial color="#9a958c" roughness={1} />
        </mesh>
      )}
    </group>
  )
}

export default function Elementos3D({ h }: { h: (x: number, y: number) => number }) {
  const elementos = useProjeto((p) => p.elementos)
  const selecao = useProjeto((p) => p.selecao)
  const { editarElemento, marcar } = useProjeto()
  const ferramenta = useEstado((s) => s.ferramenta)
  const [alvo, setAlvo] = useState<THREE.Object3D | null>(null)
  const arrastando = useRef(false)

  const sel = selecao?.tipo === 'elemento' ? elementos.find((e) => e.id === selecao.id) : undefined
  const modo = ferramenta === 'girar' ? 'rotate' : ferramenta === 'escala' ? 'scale' : 'translate'

  return (
    <group>
      {elementos.map((e) => (
        <ElementoNoTerreno key={e.id} e={e} h={h} selecionado={e.id === sel?.id} registrar={setAlvo} />
      ))}
      {sel && alvo && ferramenta !== 'cota' && (
        <TransformControls
          object={alvo}
          mode={modo}
          space="local"
          showY={modo === 'rotate' || modo === 'scale'}
          showX={modo !== 'rotate'}
          showZ={modo !== 'rotate'}
          translationSnap={0.5}
          rotationSnap={Math.PI / 36}
          scaleSnap={0.02}
          size={0.9}
          onMouseDown={() => {
            arrastando.current = true
            marcar()
          }}
          onMouseUp={() => {
            arrastando.current = false
            if (modo !== 'scale') return
            // Converte a escala do gizmo em medidas reais e zera a escala.
            const s = alvo.scale
            editarElemento(
              sel.id,
              { largura: arred(sel.largura * s.x, 2), altura: arred(sel.altura * s.y, 2), comprimento: arred(sel.comprimento * s.z, 2) },
              false,
            )
            alvo.scale.set(1, 1, 1)
          }}
          onObjectChange={() => {
            if (!arrastando.current) return
            if (modo === 'translate') editarElemento(sel.id, { x: arred(alvo.position.x), y: arred(-alvo.position.z) }, false)
            if (modo === 'rotate') editarElemento(sel.id, { rot: arred(rumo(alvo), 1) }, false)
          }}
        />
      )}
    </group>
  )
}
