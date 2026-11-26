import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { texturaFolhas } from './texturas3d'
import { useEstado } from '../state/store'
import { useProjeto, type Arvore } from '../state/projeto'
import { variacao } from '../model/arvores'
import { noPlanoHorizontal, passoDe, useArrasto } from './arrasto3d'
import Etiqueta3D from './Etiqueta3D'

const COR_SELECAO = new THREE.Color('#7ea4ff')
const arred = (v: number) => Math.round(v * 100) / 100

/** Ruído 3D simples (valor em grade), determinístico, de -1 a 1. */
function ruido3(x: number, y: number, z: number) {
  const h = (i: number, j: number, k: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) & 0xffff) / 0x7fff - 1
  }
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const fx = x - i, fy = y - j, fz = z - k
  const s = (t: number) => t * t * (3 - 2 * t)
  const [u, v, w] = [s(fx), s(fy), s(fz)]
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(h(i, j, k), h(i + 1, j, k), u), l(h(i, j + 1, k), h(i + 1, j + 1, k), u), v),
    l(l(h(i, j, k + 1), h(i + 1, j, k + 1), u), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), u), v),
    w,
  )
}

/**
 * Tufo de folhagem: esfera irregular (ruído em duas escalas), achatada embaixo, mais escura
 * por baixo e por dentro (sombra da própria copa). Raio ~1.
 */
const geoTufo = (() => {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 4)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const cores: number[] = []
  const uv: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const r = 1 + 0.2 * ruido3(p.x * 2.1 + 5, p.y * 2.1, p.z * 2.1) + 0.08 * ruido3(p.x * 6 + 1, p.y * 6 + 3, p.z * 6)
    p.multiplyScalar(r)
    if (p.y < -0.3) p.y = -0.3 + (p.y + 0.3) * 0.55
    pos.setXYZ(i, p.x, p.y, p.z)
    const luz = 0.55 + 0.45 * Math.min(1, Math.max(0, (p.y + 0.6) / 1.5))
    cores.push(luz, luz, luz)
    uv.push((p.x + p.z) * 1.4, p.y * 1.4)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
})()

const materialCopa = new THREE.MeshStandardMaterial({ map: texturaFolhas(), vertexColors: true, roughness: 0.88, metalness: 0 })

/** Tufos de cada árvore: deslocamento (em raios da copa), altura (em alturas) e tamanho. */
const TUFOS = [
  { dx: 0, dz: 0, y: 0.72, s: 1 },
  { dx: 0.5, dz: 0.15, y: 0.6, s: 0.68 },
  { dx: -0.35, dz: -0.45, y: 0.8, s: 0.6 },
]

/** Árvores da mata, cada uma selecionável: clique seleciona, Shift+clique soma, arrastar move. */
export default function Arvores3D({ h }: { h: (x: number, y: number) => number }) {
  const arvores = useProjeto((p) => p.arvores)
  const selecao = useProjeto((p) => p.selecao)
  const ferramenta = useEstado((s) => s.ferramenta)
  const caminhando = useEstado((s) => s.caminhando)
  const editando = ferramenta === 'selecionar' && !caminhando
  const { iniciar } = useArrasto()
  const troncos = useRef<THREE.InstancedMesh>(null)
  const copas = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)]
  const [etiqueta, setEtiqueta] = useState<{ texto: string; pos: [number, number, number] } | null>(null)
  const selecionadas = useMemo(() => new Set(selecao?.tipo === 'arvores' ? selecao.ids : []), [selecao])
  const n = arvores.length

  useEffect(() => {
    const ms = copas.map((c) => c.current)
    if (!troncos.current || ms.some((c) => !c)) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const cor = new THREE.Color()
    const eixo = new THREE.Vector3(0, 1, 0)
    const v3 = new THREE.Vector3(), esc = new THREE.Vector3()
    arvores.forEach((a, i) => {
      const v = variacao(a.id)
      const base = h(a.x, a.y)
      const raio = a.copa / 2
      q.setFromAxisAngle(eixo, v.giro)
      m.compose(v3.set(a.x, base + a.altura * 0.3, -a.y), q, esc.set(v.tronco, a.altura * 0.6, v.tronco))
      troncos.current!.setMatrixAt(i, m)
      const c = Math.cos(v.giro), sn = Math.sin(v.giro)
      TUFOS.forEach((t, k) => {
        const dx = (t.dx * c - t.dz * sn) * raio, dz = (t.dx * sn + t.dz * c) * raio
        const r = raio * t.s
        q.setFromAxisAngle(eixo, v.giro + k * 2.1)
        m.compose(v3.set(a.x + dx, base + a.altura * t.y, -a.y + dz), q, esc.set(r, r * v.achatamento, r))
        ms[k]!.setMatrixAt(i, m)
        // Cada tufo com um tom levemente diferente: a copa não fica chapada.
        cor.setHSL(v.h + (k - 1) * 0.012, v.s, Math.min(0.6, v.l * 1.5 + (k === 2 ? 0.03 : 0)))
        if (selecionadas.has(a.id)) cor.lerp(COR_SELECAO, 0.75)
        ms[k]!.setColorAt(i, cor)
      })
    })
    troncos.current.instanceMatrix.needsUpdate = true
    troncos.current.computeBoundingSphere()
    for (const c of ms) {
      c!.instanceMatrix.needsUpdate = true
      if (c!.instanceColor) c!.instanceColor.needsUpdate = true
      c!.computeBoundingSphere()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arvores, h, selecionadas, n])

  const arvoreDo = (ev: ThreeEvent<MouseEvent | PointerEvent>): Arvore | undefined => (ev.instanceId === undefined ? undefined : arvores[ev.instanceId])

  const aoClicar = (ev: ThreeEvent<MouseEvent>) => {
    if (!editando || ev.delta > 4) return
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
    if (!editando || ev.button !== 0 || ev.nativeEvent.shiftKey) return
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
      if (!editando) return
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
        <cylinderGeometry args={[0.7, 1.2, 1, 8]} />
        <meshStandardMaterial color="#5a4b3e" roughness={1} />
      </instancedMesh>
      {copas.map((ref, k) => (
        <instancedMesh key={'c' + k + '-' + n} ref={ref} args={[geoTufo, materialCopa, n]} castShadow receiveShadow {...eventos} dispose={null} />
      ))}
      {etiqueta && <Etiqueta3D texto={etiqueta.texto} posicao={etiqueta.pos} />}
    </group>
  )
}
