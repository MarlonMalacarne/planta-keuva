import { useEstado } from '../state/store'

export default function BarraStatus() {
  const cursor = useEstado((e) => e.cursor)
  const n = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <footer className="barra-status">
      <span>{cursor ? `X ${n(cursor.x)} m · Y ${n(cursor.y)} m · cota ${n(cursor.z)} m` : 'Passe o mouse na planta para ver coordenadas e cota'}</span>
      <span>Origem: vértice F (sudoeste) · X leste · Y norte</span>
      <span>v{__APP_VERSION__}</span>
    </footer>
  )
}
