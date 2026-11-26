# Planta Keuva

App de Mac para planejar a planta industrial da Keuva em 2D e 3D, com medidas reais,
e (nos próximos passos) terraplanagem, modelagem, importação de modelos e gestão da obra.

## O que já faz

- **Terreno em escala real**: as divisas foram vetorizadas da foto aérea do levantamento.
  Os lados conferem com as medidas com erro menor que 10 cm, e a área calculada é 20.192 m²
  (foto: 20.200 m²).
- **Restrições**: faixa de recuo de 5 m junto à rodovia (cerca de 980 m²), reserva legal (0,4 ha) e
  área de compensação ambiental (600 m²) do laudo agronômico. Na reserva e na compensação o app não
  deixa construir: o elemento para na borda e aparece um aviso. A área de supressão autorizada dos
  ligustros (0,49 ha) aparece tracejada.
- **Relevo**: curvas de nível e 3D a partir dos pontos de cota, com exagero vertical ajustável.
- **Cotas à mão**: escolha a ferramenta de cota (ícone de mira ou tecla `C`), clique no terreno
  onde mediu e digite o nível no painel. O relevo, as curvas e o 3D mudam na hora. Na planta 2D,
  arraste um ponto para movê-lo. Tudo fica salvo no seu Mac.
- **Elementos da obra**: em **Adicionar**, coloque galpão, prédio, tanque/silo, muro ou bloco.
  O app escolhe um lugar livre dentro do lote, fora do recuo e das áreas protegidas.
- **Selecionar e editar**: clique num elemento (no 3D, na planta ou na lista à esquerda).
  Arraste o elemento para mover, puxe as setas azuis para esticar uma face (a face oposta fica
  parada), a seta de cima para a altura e o anel para girar. Shift deixa os passos finos. Também
  dá para digitar posição, giro e medidas exatas no painel da direita. `Cmd+D` duplica,
  `Delete` apaga, `Cmd+Z` desfaz.
- **Árvores**: ficam as da reserva legal, da compensação e da mata fora do pedido de corte; saem
  só as da área de supressão. Cada árvore é um objeto. Clique para selecionar, Shift + clique para somar,
  Shift + arraste na planta para pegar uma área. Arraste para mover, `Delete` apaga.
- **Pintar o chão**: ferramenta do rolinho (tecla `P`) ou Adicionar > Piso. Escolha asfalto,
  cascalho, concreto, bloquete, grama ou terra e clique nos cantos (clique duplo ou `Enter`
  conclui; Shift + arraste faz um retângulo). O painel mostra área e perímetro.
- **Portão e caminhos**: em Adicionar há o portão de correr. Os caminhos das carretas aparecem
  como linhas com setas no sentido em que se anda (camada "Fluxo das carretas"). Clique num
  caminho para selecionar e arraste os pontos para mudar o trajeto; Option + clique tira um ponto.
- **Proposta da vinícola**: em Propostas, no painel da esquerda, "Carregar proposta" monta um
  layout completo: pavilhão de 1.800 m², 50 tanques de 4,5 m e 100 de 2,5 m, portão com guarita
  e duas balanças, pátio e vias de asfalto, rotatória e retorno para carretas, e o fluxo das
  carretas de uva e das carretas-tanque. Tudo fora do recuo, da reserva, da compensação e da mata
  que fica. Depois de carregar, cada peça é editável; `Cmd+Z` volta ao que havia antes.
- **3D realista**: luz do dia com sombras, reflexo do céu no inox e nos vidros, pavilhão com
  telha metálica, portas e claraboias, asfalto e concreto com textura. O botão **Técnico** volta
  a mostrar recuo, áreas protegidas, marcos e cotas.
- **Caminhar**: no 3D, o botão "Caminhar" coloca você no terreno em primeira pessoa. `W A S D`
  ou setas andam, arrastar olha em volta, Shift corre, `Esc` sai.
- **Atualização automática**: ao abrir, o app procura versão nova e se instala com um clique.

## Instalar no Mac

1. Abra a página de [Releases](../../releases) e baixe o arquivo `.dmg` mais recente.
2. Arraste o *Planta Keuva* para a pasta Aplicativos.
3. Na primeira vez, o macOS avisa que não conseguiu verificar o app (ele ainda não tem a
   assinatura paga da Apple). Abra **Ajustes do Sistema > Privacidade e Segurança**, role até o
   aviso do *Planta Keuva* e clique em **Abrir Mesmo Assim**. Isso só é preciso uma vez.
   Se o botão não aparecer, rode no Terminal:
   `xattr -dr com.apple.quarantine "/Applications/Planta Keuva.app"`

## Como o relevo é calculado

Dentro da área coberta pelos pontos, o app monta uma malha de triângulos (TIN), como na
topografia, e interpola linearmente: a superfície passa exatamente por cada cota medida.
Fora dela, estende o relevo com um plano de tendência. Quanto mais pontos medidos dentro do lote,
mais fiel o resultado.

## Para desenvolvimento

```bash
npm install
npm run dev        # abre no navegador em http://localhost:1420
npm test           # testes
npm run tauri dev  # abre como app de Mac (precisa de Rust)
```

Coordenadas: origem no vértice F (canto sudoeste), X para o leste e Y para o norte, em metros.
Os dados do terreno estão em `src/data/terreno.json`.

### Lançar uma versão nova

1. Suba o número da versão em `package.json` e em `src-tauri/Cargo.toml`.
2. Depois de juntar na `main`, rode o fluxo *Publicar versão do app (Mac)* em Actions
   (botão **Run workflow**) ou envie a tag correspondente (`git tag v0.2.0 && git push origin v0.2.0`).
3. O fluxo gera o `.dmg`, cria a tag `v<versão>` e publica o arquivo de atualização assinado.
   Ele precisa do segredo `TAURI_SIGNING_PRIVATE_KEY` no repositório, e o app só consegue
   baixar atualizações se o arquivo `latest.json` da release for acessível.
