# Planta Keuva

App de Mac para planejar a planta industrial da Keuva em 2D e 3D, com medidas reais,
e (nos próximos passos) terraplanagem, modelagem, importação de modelos e gestão da obra.

## O que já faz (passo 1)

- **Terreno em escala real**: as divisas foram vetorizadas da foto aérea do levantamento.
  Os lados conferem com as medidas com erro menor que 10 cm, e a área calculada é 20.192 m²
  (foto: 20.200 m²).
- **Restrições**: faixa de recuo de 5 m junto à rodovia (cerca de 980 m²) e a área de mata (aproximada).
- **Relevo**: curvas de nível e 3D a partir dos pontos de cota, com exagero vertical ajustável.
- **Cotas à mão**: na aba *Cotas do relevo*, use **Nova cota** (ou tecla `C`), clique na planta onde
  mediu e digite o nível. O relevo, as curvas e o 3D mudam na hora. Arraste um ponto para movê-lo,
  `Delete` apaga, `Cmd+Z` desfaz. Tudo fica salvo no seu Mac.
- **Atualização automática**: ao abrir, o app procura versão nova e se instala com um clique.

## Instalar no Mac

1. Abra a página de [Releases](../../releases) e baixe o arquivo `.dmg` mais recente.
2. Arraste o *Planta Keuva* para a pasta Aplicativos.
3. Na primeira vez, clique com o botão direito no app e escolha **Abrir** (o app ainda não tem
   assinatura paga da Apple, então o macOS pede essa confirmação uma vez).

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

1. Suba o número da versão em `package.json`.
2. Crie e envie a tag correspondente: `git tag v0.2.0 && git push origin v0.2.0`.
3. O fluxo *Publicar versão do app (Mac)* gera o `.dmg` e o arquivo de atualização assinado.
   Ele precisa do segredo `TAURI_SIGNING_PRIVATE_KEY` no repositório, e o app só consegue
   baixar atualizações se o arquivo `latest.json` da release for acessível.
