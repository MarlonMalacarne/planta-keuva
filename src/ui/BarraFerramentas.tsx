import { useEffect, useRef, useState } from 'react'
import { Crosshair, MousePointer2, Plus, TreeDeciduous, Undo2 } from 'lucide-react'
import { useEstado, type Ferramenta } from '../state/store'
import { PONTO_INICIAL, useProjeto } from '../state/projeto'
import { catalogo, lugarLivre, type TipoElemento } from '../model/elementos'
import { areasDeObra } from '../model/protecao'
import { iconeElemento } from './icones'

const ferramentas: { id: Ferramenta; nome: string; tecla: string; Icone: typeof MousePointer2 }[] = [
  { id: 'selecionar', nome: 'Selecionar, mover e esticar', tecla: 'V', Icone: MousePointer2 },
  { id: 'cota', nome: 'Marcar cota do terreno', tecla: 'C', Icone: Crosshair },
]

export default function BarraFerramentas() {
  const { ferramenta, setFerramenta } = useEstado()
  const { adicionarElemento, adicionarArvore, desfazer, historico, elementos, arvores } = useProjeto()
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const fechar = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('pointerdown', fechar)
    return () => window.removeEventListener('pointerdown', fechar)
  }, [menu])

  const adicionar = (tipo: TipoElemento) => {
    // Coloca o elemento num lugar livre (fora do recuo, das áreas protegidas e das árvores), perto do centro da parte aberta.
    const m = catalogo[tipo]
    const [x, y] = lugarLivre(m.largura, m.comprimento, elementos, { ...areasDeObra, arvores }, PONTO_INICIAL) ?? PONTO_INICIAL
    adicionarElemento(tipo, x, y)
    setFerramenta('selecionar')
    setMenu(false)
  }

  const novaArvore = () => {
    const [x, y] = lugarLivre(6, 6, elementos, { ...areasDeObra, arvores }, PONTO_INICIAL) ?? PONTO_INICIAL
    adicionarArvore(x, y)
    setFerramenta('selecionar')
    setMenu(false)
  }

  // O menu fica fora da cápsula: um vidro dentro de outro não desfoca o que está atrás.
  return (
    <div className="barra-wrap" ref={ref}>
      <div className="barra-ferramentas vidro" role="toolbar" aria-label="Ferramentas">
        <button className="botao-primario" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <Plus size={16} strokeWidth={2.2} /> Adicionar
        </button>
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
      {menu && (
        <div className="menu vidro">
          {(Object.keys(catalogo) as TipoElemento[]).map((t) => {
            const I = iconeElemento[t]
            return (
              <button key={t} onClick={() => adicionar(t)}>
                <span className="icone-menu">
                  <I size={18} />
                </span>
                <span>
                  <b>{catalogo[t].nome}</b>
                  <small>{catalogo[t].descricao}</small>
                </span>
              </button>
            )
          })}
          <button onClick={novaArvore}>
            <span className="icone-menu verde">
              <TreeDeciduous size={18} />
            </span>
            <span>
              <b>Árvore</b>
              <small>Para paisagismo ou para repor a vegetação</small>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
