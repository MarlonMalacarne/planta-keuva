import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Vec2 } from '../geo/polygon'
import { useEstado } from '../state/store'
import { useProjeto, type Piso } from '../state/projeto'
import { escalaTextura, geometriaNoChao, texturaPiso } from './chao3d'

type Altura = (x: number, y: number) => number

/** Linha que acompanha o relevo (contorno do piso selecionado e o desenho em andamento). */
export function LinhaSobre({ pts, h, cor, fechada = false, tracejada = false, largura = 3, elevar = 0.3, porCima = true }: { pts: Vec2[]; h: Altura; cor: string; fechada?: boolean; tracejada?: boolean; largura?: number; elevar?: number; porCima?: boolean }) {
  const pontos = useMemo(() => {
    const lista = fechada ? [...pts, pts[0]] : pts
    const out: [number, number, number][] = []
    for (let i = 0; i < lista.length - 1; i++) {
      const [ax, ay] = lista[i], [bx, by] = lista[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2))
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n
        out.push([x, h(x, y) + elevar, -y])
      }
    }
    const [lx, ly] = lista[lista.length - 1]
    out.push([lx, h(lx, ly) + elevar, -ly])
    return out
  }, [pts, h, fechada, elevar])
  if (pts.length < 2) return null
  return <Line points={pontos} color={cor} lineWidth={largura} dashed={tracejada} dashSize={1.5} gapSize={1} depthTest={!porCima} renderOrder={porCima ? 5 : 1} />
}

function PisoNoChao({ p, h, selecionado, ordem }: { p: Piso; h: Altura; selecionado: boolean; ordem: number }) {
  // Pisos podem se sobrepor (concreto em cima do asfalto): o que vem depois na lista fica por cima.
  const camada = Math.min(ordem, 30)
  const geo = useMemo(() => geometriaNoChao(p.pontos, h, 0.07 + camada * 0.015, escalaTextura[p.material]), [p.pontos, p.material, h, camada])
  useEffect(() => () => geo.dispose(), [geo])
  const aoClicar = (ev: ThreeEvent<MouseEvent>) => {
    const { ferramenta, caminhando } = useEstado.getState()
    if (ferramenta !== 'selecionar' || caminhando || ev.delta > 4) return // pintando: o clique segue para o chão
    ev.stopPropagation()
    useProjeto.getState().selecionar({ tipo: 'piso', id: p.id })
  }
  return (
    <group>
      <mesh geometry={geo} receiveShadow onClick={aoClicar}>
        <meshStandardMaterial map={texturaPiso(p.material)} roughness={p.material === 'concreto' ? 0.8 : 0.95} polygonOffset polygonOffsetFactor={-1 - camada * 0.2} polygonOffsetUnits={-1 - camada * 2} />
      </mesh>
      {selecionado && <LinhaSobre pts={p.pontos} h={h} cor="#7ea4ff" fechada largura={3} />}
    </group>
  )
}

/** Pisos pintados e o desenho em andamento da ferramenta de pintar o chão. */
export default function Pisos3D({ h }: { h: Altura }) {
  const pisos = useProjeto((p) => p.pisos)
  const selecao = useProjeto((p) => p.selecao)
  const rascunho = useEstado((e) => e.rascunho)
  const ferramenta = useEstado((e) => e.ferramenta)
  return (
    <group>
      {pisos.map((p, i) => (
        <PisoNoChao key={p.id} p={p} h={h} ordem={i} selecionado={selecao?.tipo === 'piso' && selecao.id === p.id} />
      ))}
      {ferramenta === 'piso' && rascunho.length > 0 && (
        <group>
          <LinhaSobre pts={rascunho} h={h} cor="#ffffff" fechada={rascunho.length >= 3} tracejada largura={2.5} />
          {rascunho.map(([x, y], i) => (
            <mesh key={i} position={[x, h(x, y) + 0.3, -y]} renderOrder={6}>
              <sphereGeometry args={[i === 0 ? 0.6 : 0.4, 12, 8]} />
              <meshBasicMaterial color={i === 0 ? '#5b8cff' : '#ffffff'} depthTest={false} transparent />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
