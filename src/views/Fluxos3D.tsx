import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useEstado } from '../state/store'
import { useProjeto, type Fluxo } from '../state/projeto'
import { setasDoFluxo } from '../model/fluxos'
import { LinhaSobre } from './Pisos3D'

type Altura = (x: number, y: number) => number
const COR_SELECAO = '#5b8cff'

/** Seta deitada no chão, apontando para +x (gira em volta do eixo vertical). */
const geoSeta = (() => {
  const s = new THREE.Shape()
  s.moveTo(1.6, 0)
  s.lineTo(-1.1, 1.25)
  s.lineTo(-0.5, 0)
  s.lineTo(-1.1, -1.25)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2) // deita no plano do chão (y para cima)
  return g
})()

function FluxoNoChao({ f, h, selecionado }: { f: Fluxo; h: Altura; selecionado: boolean }) {
  const setas = useMemo(() => setasDoFluxo(f.pontos, 16), [f.pontos])
  const cor = selecionado ? COR_SELECAO : f.cor
  const aoClicar = (ev: ThreeEvent<MouseEvent>) => {
    const { ferramenta, caminhando } = useEstado.getState()
    if (ferramenta !== 'selecionar' || caminhando || ev.delta > 4) return
    ev.stopPropagation()
    useProjeto.getState().selecionar({ tipo: 'fluxo', id: f.id })
  }
  return (
    <group>
      <LinhaSobre pts={f.pontos} h={h} cor={cor} largura={selecionado ? 5 : 3.5} elevar={0.45} porCima={false} />
      {setas.map(({ p, ang }, i) => (
        <mesh key={i} geometry={geoSeta} position={[p[0], h(p[0], p[1]) + 0.5, -p[1]]} rotation={[0, ang, 0]} onClick={aoClicar} renderOrder={2}>
          <meshBasicMaterial color={cor} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Caminhos com setas (fluxo das carretas) por cima do terreno e dos pisos. */
export default function Fluxos3D({ h }: { h: Altura }) {
  const fluxos = useProjeto((p) => p.fluxos)
  const selecao = useProjeto((p) => p.selecao)
  return (
    <group>
      {fluxos.map((f) => (
        <FluxoNoChao key={f.id} f={f} h={h} selecionado={selecao?.tipo === 'fluxo' && selecao.id === f.id} />
      ))}
    </group>
  )
}
