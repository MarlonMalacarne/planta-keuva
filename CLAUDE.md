# Planta Keuva

App de Mac (Tauri 2 + React + Three.js/react-three-fiber) para planejar a planta industrial
da Keuva e gerir a obra. Usuário final: Marlon, não programa; textos da interface em português.

- Coordenadas em metros: origem no vértice F (sudoeste), X = leste, Y = norte. No 3D: x = X,
  y = (cota - 770) * exagero, z = -Y.
- `src/data/terreno.json`: divisas vetorizadas da foto aérea, recuo (5 m), mata (aproximada),
  cotas lidas da foto. Não editar à mão sem conferir os testes de área/lados.
- Cotas são editáveis pelo usuário e ficam no store persistido `src/state/projeto.ts`
  (localStorage). Mudanças no formato precisam de `version` + `migrate` no persist para não
  perder dados de quem já usa o app.
- Relevo: `src/geo/elevation.ts` (TIN Delaunay + extrapolação plano/IDW fora da cobertura).
- Verificação: `npm run typecheck && npm test && npx vite build`. Rust: `cd src-tauri && cargo check`.
- Releases: tag `v*` dispara `.github/workflows/release.yml` (macOS, universal, updater assinado).
