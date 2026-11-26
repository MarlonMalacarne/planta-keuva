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
- Elementos (galpão, prédio, tanque, muro, bloco): `src/model/elementos.ts` (catálogo, contorno
  rotacionado, `lugarLivre`). Ficam em `projeto.ts` junto com as cotas e a `selecao` comum ao 2D,
  ao 3D e aos painéis. `rot` em graus anti-horário visto de cima = `rotation.y` no 3D.
  Edição: `editarElemento(id, dados, registrar)`; arrastos chamam `marcar()` uma vez no início
  e editam com `registrar = false`, para o `Cmd+Z` desfazer o arrasto inteiro.
- Preferências de tela (vista, camadas, exagero) em `src/state/store.ts`, também versionadas.
- Interface: palco em tela cheia + painéis flutuantes (`src/ui/`), estilo em `src/styles.css`,
  ícones `lucide-react`.
- Relevo: `src/geo/elevation.ts` (TIN Delaunay + extrapolação plano/IDW fora da cobertura).
- Verificação: `npm run typecheck && npm test && npx vite build`. Rust: `cd src-tauri && cargo check`.
- Releases: tag `v*` ou "Run workflow" em `.github/workflows/release.yml` (macOS, universal,
  updater assinado; o tauri-action cria a tag `v<versão>`). Subir a versão em `package.json` e
  `src-tauri/Cargo.toml`. O proxy da nuvem bloqueia criar tags e disparar Actions: rodar pelo
  navegador do Mac do Marlon, com o OK dele.
