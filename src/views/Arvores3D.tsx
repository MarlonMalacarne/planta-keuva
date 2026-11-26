import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEstado } from '../state/store'
import { useProjeto, type Arvore } from '../state/projeto'
import { variacao } from '../model/arvores'
import { noPlanoHorizontal, passoDe, useArrasto } from './arrasto3d'
import Etiqueta3D from './Etiqueta3D'

const COR_SELECAO = new THREE.Color('#7ea4ff')
const arred = (v: number) => Math.round(v * 100) / 100

/** Árvores da mata, cada uma selecionável: clique seleciona, Shift+clique soma, arrastar move. */
export default function Arvores3D({ h }: { h: (x: number, y: number) => number }) {
  const arvores = useProjeto((p) => p.arvores)
  const selecao = useProjeto((p) => p.selecao)
  const ferramenta = useEstado((s) => s.ferramenta)
  const { iniciar } = useArrasto()
  const troncos = useRef<THREE.InstancedMesh>(null)
  const copas = useRef<THREE.InstancedMesh>(null)
  const [etiqueta, setEtiqueta] = useState<{ texto: string; pos: [number, number, number] } | null>(null)
  const selecionadas = useMemo(() => new Set(selecao?.tipo === 'arvores' ? selecao.ids : []), [selecao])
  const n = arvores.length

  useEffect(() => {
    if (!troncos.current || !copas.current) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const cor = new THREE.Color()
    const eixo = new THREE.Vector3(0, 1, 0)
    arvores.forEach((a, i) => {
      const v = variacao(a.id)
      const base = h(a.x, a.y)
      const raio = a.copa / 2
      q.setFromAxisAngle(eixo, v.giro)
      m.compose(new THREE.Vector3(a.x, base + a.altura * 0.3, -a.y), q, new THREE.Vector3(v.tronco, a.altura * 0.6, v.tronco))
      troncos.current!.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(a.x, base + a.altura * 0.72, -a.y), q, new THREE.Vector3(raio, raio * v.achatamento, raio))
      copas.current!.setMatrixAt(i, m)
      cor.setHSL(v.h, v.s, v.l)
      if (selecionadas.has(a.id)) cor.lerp(COR_SELECAO, 0.75)
      copas.current!.setColorAt(i, cor)
    })
    troncos.current.instanceMatrix.needsUpdate = true
    copas.current.instanceMatrix.needsUpdate = true
    if (copas.current.instanceColor) copas.current.instanceColor.needsUpdate = true
    troncos.current.computeBoundingSphere()
    copas.current.computeBoundingSphere()
  }, [arvores, h, selecionadas, n])

  const arvoreDo = (ev: ThreeEvent<MouseEvent | PointerEvent>): Arvore | undefined => (ev.instanceId === undefined ? undefined : arvores[ev.instanceId])

  const aoClicar = (ev: ThreeEvent<MouseEvent>) => {
    if (ferramenta === 'cota' || ev.delta > 4) return
    const a = arvoreDo(ev)
    if (!a) return
    ev.stopPropagation()
    const { selecao: s, selecionar } = useProjeto.getState()
    const atuais = s?.tipo === 'arvores' ? s.ids : []
    if (ev.nativeEvent.shiftKey) {
      const ids = atuais.includes(a.id) ? atuais.filter((id) => id !== a.id) : [...atuais, a.id]
      selecionar(ids.length ? { tipo: 'arvores', ids } : null)
    } else selecionar({ tipo: 'arvores', ids: [a.id] })
  }

  // Arrastar uma árvore já selecionada move todas as selecionadas juntas.
  const aoApertar = (ev: ThreeEvent<PointerEvent>) => {
    if (ferramenta === 'cota' || ev.button !== 0 || ev.nativeEvent.shiftKey) return
    const a = arvoreDo(ev)
    if (!a || !selecionadas.has(a.id)) return
    ev.stopPropagation()
    const base = h(a.x, a.y)
    const p0 = noPlanoHorizontal(ev.ray, base)
    if (!p0) return
    const originais = arvores.filter((x) => selecionadas.has(x.id))
    const { marcar, editarArvores } = useProjeto.getState()
    let marcado = false
    document.body.style.cursor = 'grabbing'
    iniciar(
      (raio, pe) => {
        const p = noPlanoHorizontal(raio, base)
        if (!p) return
        if (!marcado) {
          marcar()
          marcado = true
        }
        const passo = passoDe(pe, 0.5, 0.05)
        const dx = Math.round((p.x - p0.x) / passo) * passo
        const dy = Math.round(-(p.z - p0.z) / passo) * passo
        editarArvores(Object.fromEntries(originais.map((o) => [o.id, { x: arred(o.x + dx), y: arred(o.y + dy) }])), false)
        setEtiqueta({ texto: `${originais.length > 1 ? originais.length + ' árvores · ' : ''}↔ ${Math.hypot(dx, dy).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`, pos: [a.x + dx, base + a.altura + 2, -(a.y + dy)] })
      },
      () => {
        setEtiqueta(null)
        document.body.style.cursor = ''
      },
    )
  }

  const eventos = {
    onClick: aoClicar,
    onPointerDown: aoApertar,
    onPointerOver: (ev: ThreeEvent<PointerEvent>) => {
      ev.stopPropagation()
      if (!document.body.style.cursor) document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      if (document.body.style.cursor === 'pointer') document.body.style.cursor = ''
    },
  }

  if (!n) return null
  return (
    <group>
      <instancedMesh key={'t' + n} ref={troncos} args={[undefined, undefined, n]} castShadow {...eventos}>
        <cylinderGeometry args={[1, 1.3, 1, 6]} />
        <meshStandardMaterial color="#5b4636" roughness={1} />
      </instancedMesh>
      <instancedMesh key={'c' + n} ref={copas} args={[undefined, undefined, n]} castShadow receiveShadow {...eventos}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      {etiqueta && <Etiqueta3D texto={etiqueta.texto} posicao={etiqueta.pos} />}
    </group>
  )
}
