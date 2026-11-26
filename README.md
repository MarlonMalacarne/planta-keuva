# Planta Keuva

App de Mac para planejar a planta industrial da Keuva em 2D e 3D, com medidas reais,
e (nos próximos passos) terraplanagem, modelagem, importação de modelos e gestão da obra.

## O que já faz

- **Terreno em escala real**: as divisas foram vetorizadas da foto aérea do levantamento.
  Os lados conferem com as medidas com erro menor que 10 cm, e a área calculada é 20.192 m²
  (foto: 20.200 m²).
- **Restrições**: faixa de recuo de 5 m junto à rodovia (cerca de 980 m²) e a área de mata (aproximada).
- **Relevo**: curvas de nível e 3D a partir dos pontos de cota, com exagero vertical ajustável.
- **Cotas à mão**: escolha a ferramenta de cota (ícone de mira ou tecla `C`), clique no terreno
  onde mediu e digite o nível no painel. O relevo, as curvas e o 3D mudam na hora. Na planta 2D,
  arraste um ponto para movê-lo. Tudo fica salvo no seu Mac.
- **Elementos da obra**: em **Adicionar**, coloque galpão, prédio, tanque/silo, muro ou bloco.
  O app escolhe um lugar livre dentro do lote, fora do recuo e da mata.
- **Selecionar e editar**: clique num elemento (no 3D, na planta ou na lista à esquerda).
  Arraste as setas para mover, use `R` para girar e `E` para redimensionar, ou digite posição,
  giro e medidas exatas no painel da direita. `Cmd+D` duplica, `Delete` apaga, `Cmd+Z` desfaz.
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
