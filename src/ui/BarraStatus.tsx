import { useEstado } from '../state/store'

export default function BarraStatus() {
  const cursor = useEstado((e) => e.cursor)
  const vista = useEstado((e) => e.vista)
  const n = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <footer className="status vidro">
      {vista === '2d' && cursor ? (
        <span>
          X {n(cursor.x)} · Y {n(cursor.y)} · cota <b>{n(cursor.z)} m</b>
        </span>
      ) : (
        <span>{vista === '3d' ? 'Arraste para girar · botão direito para deslocar · role para aproximar' : 'Passe o mouse para ver a cota'}</span>
      )}
      <span className="versao">v{__APP_VERSION__}</span>
    </footer>
  )
}
