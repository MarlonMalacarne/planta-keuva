import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { contains, type Vec2 } from '../geo/polygon'
import { terreno } from '../data/terreno'
import { useEstado } from '../state/store'
import { useProjeto, type Fluxo } from '../state/projeto'
import { setasDoFluxo } from '../model/fluxos'
import { LinhaSobre, elevacaoPiso } from './Pisos3D'
import { geometriaNoChao } from './chao3d'

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

/** Contorno de uma seta de pintura viária (5 m), centrada em p e apontando para `ang`. */
function contornoSetaPintada(p: Vec2, ang: number): Vec2[] {
  const forma: Vec2[] = [[2.6, 0], [0.7, 0.78], [0.7, 0.2], [-2.4, 0.2], [-2.4, -0.2], [0.7, -0.2], [0.7, -0.78]]
  const c = Math.cos(ang), s = Math.sin(ang)
  return forma.map(([x, y]) => [p[0] + x * c - y * s, p[1] + x * s + y * c])
}

const tinta = new THREE.MeshStandardMaterial({ color: '#efeee8', roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -60 })

/** Setas brancas pintadas no asfalto, como numa via de verdade (modo realista). */
function SetasPintadas({ f, h, altura, ordem, aoClicar }: { f: Fluxo; h: Altura; altura: number; ordem: number; aoClicar: (ev: ThreeEvent<MouseEvent>) => void }) {
  const geo = useMemo(() => {
    // Caminhos que andam juntos alternam as setas; fora do lote (estrada de terra) não há pintura.
    const partes = setasDoFluxo(f.pontos, 24, 6 + ((ordem * 12) % 24))
      .filter(({ p }) => contains(terreno.perimetro, p))
      .map(({ p, ang }) => geometriaNoChao(contornoSetaPintada(p, ang), h, altura))
    if (!partes.length) return new THREE.BufferGeometry()
    const g = mergeGeometries(partes) ?? new THREE.BufferGeometry()
    partes.forEach((x) => x.dispose())
    return g
  }, [f.pontos, h, altura, ordem])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={tinta} receiveShadow onClick={aoClicar} renderOrder={2} />
}

function FluxoNoChao({ f, h, selecionado, realista, altura, ordem }: { f: Fluxo; h: Altura; selecionado: boolean; realista: boolean; altura: number; ordem: number }) {
  const setas = useMemo(() => setasDoFluxo(f.pontos, 16), [f.pontos])
  const cor = selecionado ? COR_SELECAO : f.cor
  const aoClicar = (ev: ThreeEvent<MouseEvent>) => {
    const { ferramenta, caminhando } = useEstado.getState()
    if (ferramenta !== 'selecionar' || caminhando || ev.delta > 4) return
    ev.stopPropagation()
    useProjeto.getState().selecionar({ tipo: 'fluxo', id: f.id })
  }
  if (realista)
    return (
      <group>
        <SetasPintadas f={f} h={h} altura={altura} ordem={ordem} aoClicar={aoClicar} />
        {selecionado && <LinhaSobre pts={f.pontos} h={h} cor={COR_SELECAO} largura={4} elevar={altura + 0.3} porCima={false} />}
      </group>
    )
  return (
    <group>
      <LinhaSobre pts={f.pontos} h={h} cor={cor} largura={selecionado ? 5 : 3} elevar={0.45} porCima={false} />
      {setas.map(({ p, ang }, i) => (
        <mesh key={i} geometry={geoSeta} position={[p[0], h(p[0], p[1]) + 0.5, -p[1]]} rotation={[0, ang, 0]} onClick={aoClicar} renderOrder={2}>
          <meshBasicMaterial color={cor} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Caminho das carretas: setas pintadas no chão (realista) ou linhas coloridas (técnico). */
export default function Fluxos3D({ h }: { h: Altura }) {
  const fluxos = useProjeto((p) => p.fluxos)
  const nPisos = useProjeto((p) => p.pisos.length)
  const selecao = useProjeto((p) => p.selecao)
  const realista = useEstado((e) => e.realista)
  const altura = elevacaoPiso(nPisos) + 0.02
  return (
    <group>
      {fluxos.map((f, i) => (
        <FluxoNoChao key={f.id} f={f} h={h} realista={realista} altura={altura} ordem={i} selecionado={selecao?.tipo === 'fluxo' && selecao.id === f.id} />
      ))}
    </group>
  )
}
