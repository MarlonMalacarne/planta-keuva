# Planta Keuva

App de Mac (Tauri 2 + React + Three.js/react-three-fiber) para planejar a planta industrial
da Keuva e gerir a obra. Usuário final: Marlon, não programa; textos da interface em português.

- Coordenadas em metros: origem no vértice F (sudoeste), X = leste, Y = norte. No 3D: x = X,
  y = (cota - 770) * exagero, z = -Y.
- `src/data/terreno.json`: divisas vetorizadas da foto aérea, recuo (5 m), mata (aproximada, só
  referência), cotas lidas da foto, e do laudo agronômico (ART 14725882): `reservaLegal` (0,4 ha),
  `compensacao` (600 m²) e `supressao` (0,49 ha, vértices V01–V09). Não editar à mão sem conferir
  os testes de área/lados.
- Áreas protegidas (reserva + compensação, `areasProtegidas` em `terreno.ts`): não se constrói.
  `src/model/protecao.ts` (`areaInvadida`, `areasDeObra` para o `lugarLivre`). `editarElemento`
  recusa mudança que entra nelas e chama `avisar()` (recado em `AvisoTela`); em arrasto
  (`registrar = false`) confere o caminho para o elemento parar na borda. Quem já estava dentro
  pode sair.
- Cotas são editáveis pelo usuário e ficam no store persistido `src/state/projeto.ts`
  (localStorage). Mudanças no formato precisam de `version` + `migrate` no persist para não
  perder dados de quem já usa o app.
- Elementos (galpão, prédio, tanque, muro, bloco): `src/model/elementos.ts` (catálogo, contorno
  rotacionado, `lugarLivre`). Ficam em `projeto.ts` junto com as cotas e a `selecao` comum ao 2D,
  ao 3D e aos painéis. `rot` em graus anti-horário visto de cima = `rotation.y` no 3D.
  Edição: `editarElemento(id, dados, registrar)`; arrastos chamam `marcar()` uma vez no início
  e editam com `registrar = false`, para o `Cmd+Z` desfazer o arrasto inteiro.
- Árvores: `src/model/arvores.ts` (`arvoresIniciais`: reserva + compensação + mata da foto fora
  do pedido de corte; depois editáveis) em `projeto.ts` (persist v5: da v3 saem só as árvores da
  supressão; a v4, que só tinha as protegidas, ganha de volta a mata fora do corte). A mata fora do
  corte não é bloqueada, mas não conta como área livre e o `lugarLivre` evita árvores.
  Seleção múltipla só para árvores: `{ tipo: 'arvores', ids }`.
- Pisos (chão pintado: asfalto, cascalho, concreto, bloquete, grama, terra): `src/model/pisos.ts`,
  em `projeto.ts` (persist v6, `selecao` `{ tipo: 'piso', id }`). Ferramenta `piso` (tecla P): o
  desenho em andamento fica em `useEstado().rascunho`; `src/state/desenho.ts` marca cantos (encaixe
  nos cantos do lote/pisos/elementos) e conclui. 2D em `Pisos2D.tsx` (padrões SVG), 3D em
  `Pisos3D.tsx` (texturas de canvas em `chao3d.ts`). Não entram na reserva/compensação.
- Portão (`tipo: 'portao'`, fino como muro: `finoComoMuro`; largura = espessura, comprimento =
  abertura). Caminhos das carretas: `src/model/fluxos.ts` (`Fluxo`, `setasDoFluxo`) em `projeto.ts`
  (persist v7, `selecao` `{ tipo: 'fluxo', id }`, `editarFluxo`/`removerFluxo`); 2D `Fluxos2D.tsx`
  (arrasto do caminho e dos pontos em `Plan2D.tsx`), 3D `Fluxos3D.tsx`. Camada `fluxos` nas
  preferências (store v3).
- Proposta da vinícola: `src/model/propostaVinicola.ts` gera elementos, pisos e fluxos no
  referencial da frente (`F(u, v)`: u ao longo de F→E, v para dentro); `carregarProposta` troca o
  projeto inteiro com ids novos (um `Cmd+Z` volta). `usePropostaInicial` (`App.tsx`) carrega uma vez
  só, na primeira abertura com o projeto vazio. `proposta.test.ts` confere programa, áreas
  protegidas, sobreposições e que os fluxos passam pelo portão e pelas duas balanças.
- Caminhar em primeira pessoa (`Caminhada.tsx`, `useEstado().caminhando`): troca o OrbitControls,
  WASD/setas + arrastar para olhar, olhos a 1,7 m, não atravessa elementos; Esc sai.
- Edição direta estilo Shapr3D: alças nas faces (`esticar`, a face oposta fica parada), topo
  (`esticarAltura`) e anel de giro (`girar`), no 3D (`Elementos3D.tsx`, arrastos em `arrasto3d.ts`)
  e na planta (`Plan2D.tsx`). Passo 0,5 m / 5°, Shift = fino.
- A foto aérea (`public/terreno-aereo.jpg`) foi limpa das linhas e textos do levantamento; divisas,
  recuo e medidas aparecem só pelas camadas.
- Preferências de tela (vista, camadas, exagero) em `src/state/store.ts`, também versionadas.
- Interface: palco em tela cheia + painéis flutuantes (`src/ui/`), estilo em `src/styles.css`,
  ícones `lucide-react`.
- Relevo: `src/geo/elevation.ts` (TIN Delaunay + extrapolação plano/IDW fora da cobertura).
- Verificação: `npm run typecheck && npm test && npx vite build`. Rust: `cd src-tauri && cargo check`.
- Releases: tag `v*` ou "Run workflow" em `.github/workflows/release.yml` (macOS, universal,
  updater assinado; o tauri-action cria a tag `v<versão>`). Subir a versão em `package.json` e
  `src-tauri/Cargo.toml`. O proxy da nuvem bloqueia criar tags e disparar Actions: rodar pelo
  navegador do Mac do Marlon, com o OK dele.
