import { useEffect, useState } from 'react'
import { procurarAtualizacao, type Novidade } from '../lib/updater'

export default function AvisoAtualizacao() {
  const [nova, setNova] = useState<Novidade | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    procurarAtualizacao().then(setNova)
  }, [])

  if (!nova) return null
  return (
    <div className="aviso-atualizacao" role="status">
      <span>
        Nova versão <b>{nova.versao}</b> disponível. Seus dados são mantidos.
      </span>
      {erro && <span className="erro">{erro}</span>}
      {pct === null ? (
        <button
          className="botao-primario"
          onClick={() => {
            setPct(0)
            nova.instalar(setPct).catch((e) => {
              setErro('Falhou: ' + String(e))
              setPct(null)
            })
          }}
        >
          Atualizar agora
        </button>
      ) : (
        <span>Baixando… {pct}%</span>
      )}
      <button className="botao-pequeno" onClick={() => setNova(null)}>
        Depois
      </button>
    </div>
  )
}
