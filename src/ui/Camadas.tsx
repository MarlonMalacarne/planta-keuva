import { nomesCamadas, useEstado, type Camadas as C } from '../state/store'

const grupos: { titulo: string; itens: (keyof C)[] }[] = [
  { titulo: 'Terreno', itens: ['foto', 'perimetro', 'medidas', 'grade'] },
  { titulo: 'Restrições', itens: ['recuo', 'mata', 'arvores'] },
  { titulo: 'Relevo', itens: ['curvas', 'cotas'] },
]

export default function Camadas() {
  const { camadas, alternar, exagero, setExagero, intervaloCurvas, setIntervalo } = useEstado()
  return (
    <aside className="painel painel-esq">
      <h2>Camadas</h2>
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h3>{g.titulo}</h3>
          {g.itens.map((k) => (
            <label key={k} className="camada">
              <input type="checkbox" checked={camadas[k]} onChange={() => alternar(k)} />
              <span className={`amostra amostra-${k}`} />
              {nomesCamadas[k]}
            </label>
          ))}
        </section>
      ))}
      <section>
        <h3>Relevo</h3>
        <label className="campo">
          Curvas a cada
          <select value={intervaloCurvas} onChange={(e) => setIntervalo(Number(e.target.value))}>
            {[0.25, 0.5, 1, 2].map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString('pt-BR')} m
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Exagero vertical no 3D: <b>{exagero}×</b>
          <input type="range" min={1} max={5} step={0.5} value={exagero} onChange={(e) => setExagero(Number(e.target.value))} />
        </label>
      </section>
    </aside>
  )
}
