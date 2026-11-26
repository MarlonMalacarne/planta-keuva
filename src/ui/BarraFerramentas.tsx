import { useEffect, useRef, useState } from 'react'
import { Crosshair, MousePointer2, Plus, RotateCw, Scaling, Undo2 } from 'lucide-react'
import { useEstado, type Ferramenta } from '../state/store'
import { PONTO_INICIAL, useProjeto } from '../state/projeto'
import { catalogo, lugarLivre, type TipoElemento } from '../model/elementos'
import { terreno } from '../data/terreno'
import { iconeElemento } from './icones'

const ferramentas: { id: Ferramenta; nome: string; tecla: string; Icone: typeof MousePointer2 }[] = [
  { id: 'selecionar', nome: 'Selecionar e mover', tecla: 'V', Icone: MousePointer2 },
  { id: 'girar', nome: 'Girar', tecla: 'R', Icone: RotateCw },
  { id: 'escala', nome: 'Redimensionar', tecla: 'E', Icone: Scaling },
  { id: 'cota', nome: 'Marcar cota do terreno', tecla: 'C', Icone: Crosshair },
]

export default function BarraFerramentas() {
  const { ferramenta, setFerramenta } = useEstado()
  const { adicionarElemento, desfazer, historico, elementos } = useProjeto()
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const fechar = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('pointerdown', fechar)
    return () => window.removeEventListener('pointerdown', fechar)
  }, [menu])

  const adicionar = (tipo: TipoElemento) => {
    // Coloca o elemento num lugar livre da área construível, perto do centro da parte aberta.
    const m = catalogo[tipo]
    const areas = { lote: terreno.perimetro, proibidas: [terreno.recuo.poligono, terreno.mata.poligono] }
    const [x, y] = lugarLivre(m.largura, m.comprimento, elementos, areas, PONTO_INICIAL) ?? PONTO_INICIAL
    adicionarElemento(tipo, x, y)
    setFerramenta('selecionar')
    setMenu(false)
  }

  return (
    <div className="barra-ferramentas vidro" role="toolbar" aria-label="Ferramentas">
      <div className="menu-adicionar" ref={ref}>
        <button className="botao-primario" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <Plus size={16} strokeWidth={2.2} /> Adicionar
        </button>
        {menu && (
          <div className="menu vidro">
            {(Object.keys(catalogo) as TipoElemento[]).map((t) => {
              const I = iconeElemento[t]
              return (
                <button key={t} onClick={() => adicionar(t)}>
                  <I size={18} />
                  <span>
                    <b>{catalogo[t].nome}</b>
                    <small>{catalogo[t].descricao}</small>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <span className="separador" />
      {ferramentas.map(({ id, nome, tecla, Icone }) => (
        <button key={id} className={`botao-icone ${ferramenta === id ? 'ativo' : ''}`} onClick={() => setFerramenta(id)} title={`${nome} (${tecla})`} aria-pressed={ferramenta === id}>
          <Icone size={17} />
        </button>
      ))}
      <span className="separador" />
      <button className="botao-icone" onClick={desfazer} disabled={!historico.length} title="Desfazer (Cmd+Z)">
        <Undo2 size={17} />
      </button>
    </div>
  )
}
