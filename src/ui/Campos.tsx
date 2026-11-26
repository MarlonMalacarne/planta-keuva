import { useEffect, useRef, useState } from 'react'

const formatar = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas, useGrouping: false })

/** Campo numérico que aceita vírgula ou ponto, mostra a unidade e só grava ao confirmar (Enter ou sair do campo). */
export function CampoNumero({
  rotulo, valor, onSalvar, unidade = 'm', casas = 2, min, autoFocus,
}: { rotulo: string; valor: number; onSalvar: (v: number) => void; unidade?: string; casas?: number; min?: number; autoFocus?: boolean }) {
  const [texto, setTexto] = useState(formatar(valor, casas))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (document.activeElement !== ref.current) setTexto(formatar(valor, casas))
  }, [valor, casas])
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [autoFocus])
  const salvar = () => {
    let v = Number(texto.replace(',', '.').trim())
    if (texto.trim() === '' || !Number.isFinite(v)) return setTexto(formatar(valor, casas))
    if (min !== undefined) v = Math.max(min, v)
    if (v !== valor) onSalvar(v)
    setTexto(formatar(v, casas))
  }
  return (
    <label className="campo-num">
      <span>{rotulo}</span>
      <div>
        <input
          ref={ref}
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setTexto(formatar(valor, casas))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <em>{unidade}</em>
      </div>
    </label>
  )
}
