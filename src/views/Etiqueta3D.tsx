import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Etiqueta de texto desenhada numa textura (sem DOM), sempre de frente e com tamanho fixo na tela.
 * `altura` é a fração da altura da tela.
 */
export default function Etiqueta3D({ texto, posicao, fundo = 'rgba(18, 20, 26, 0.82)', cor = '#fff', altura = 0.03 }: { texto: string; posicao: [number, number, number] | THREE.Vector3; fundo?: string; cor?: string; altura?: number }) {
  const { tex, aspecto } = useMemo(() => {
    const H = 64
    const fonte = '600 34px -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif'
    const c = document.createElement('canvas')
    const g = c.getContext('2d')!
    g.font = fonte
    const W = Math.ceil(g.measureText(texto).width + 40)
    c.width = W
    c.height = H
    g.font = fonte
    g.fillStyle = fundo
    g.beginPath()
    g.roundRect(2, 2, W - 4, H - 4, (H - 4) / 2)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.28)'
    g.lineWidth = 2
    g.stroke()
    g.fillStyle = cor
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, W / 2, H / 2 + 1)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return { tex: t, aspecto: W / H }
  }, [texto, fundo, cor])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <sprite position={posicao} scale={[altura * aspecto, altura, 1]} renderOrder={20}>
      <spriteMaterial map={tex} sizeAttenuation={false} depthTest={false} depthWrite={false} transparent />
    </sprite>
  )
}
