import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useProjeto } from '../state/projeto'

/** Recado rápido no alto da tela, some sozinho (ex.: tentativa de construir na reserva). */
export default function AvisoTela() {
  const aviso = useProjeto((p) => p.aviso)
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    if (!aviso) return
    setVisivel(true)
    const t = setTimeout(() => setVisivel(false), 2600)
    return () => clearTimeout(t)
  }, [aviso])
  if (!aviso || !visivel) return null
  return (
    <div className="aviso-tela vidro" role="status">
      <ShieldAlert size={16} /> {aviso.texto}
    </div>
  )
}
