# Frete que não derrete

App de frete da Nuvemshop para a Cabruca Chocolates, de Ilhéus. No checkout, ele responde com as opções de entrega que fazem o chocolate chegar inteiro. Para isso, olha a previsão do tempo no destino, o prazo de cada serviço e os fins de semana e feriados do caminho. Quando o pedido é pago, escreve no próprio pedido o que montar e em que dia despachar.

**Projeto conceito.** A Cabruca é fictícia, e os preços e prazos são de uma tabela de transportadora inventada. A previsão do tempo é real.

- Demonstração: https://luisantoniodev.tech/projetos/cabruca-frete/
- Portfólio: https://luisantoniodev.tech

## O problema

Chocolate amolece perto dos 29 °C e o recheado derrete antes, perto dos 25 °C. O que estraga a encomenda raramente é a estrada. É o pacote que sai na quinta, chega ao centro de distribuição na sexta e passa o fim de semana num galpão sem ar, em Cuiabá, a 38 °C.

A loja vendia com o frete padrão da plataforma, que só sabe peso e CEP. Para não perder encomenda, a dona fazia uma de duas coisas. Ou mandava tudo com caixa térmica, e o frete ficava caro para quem mora em Curitiba em novembro. Ou segurava pedidos e explicava pelo WhatsApp, um por um.

## O que o app faz

Em cada cotação do checkout, para cada serviço da transportadora:

1. **Quando o pacote sai.** Pedido pago até as 11h num dia útil sai no mesmo dia. Se o carrinho tem chocolate, o despacho espera o primeiro dia em que a viagem inteira cabe em dias úteis seguidos. Pedido de quinta à tarde para entrega em dois dias sai na segunda. Serviço de cinco dias úteis ou mais sempre atravessaria um fim de semana e sai da lista.
2. **Que calor ele pega.** Vale a maior máxima prevista no estado de destino, do despacho à entrega.
3. **Se precisa de caixa térmica.** O limite é o do produto mais sensível do carrinho: 25 °C para recheados e ao leite, 29 °C para os amargos. Cacau em pó, nibs e mel vão como qualquer pacote. Acima do limite, a opção vira "com caixa térmica", com um gelo reciclável por dia de viagem, e o preço inclui a caixa, os gelos e o peso deles. A caixa segura 4 dias, ou 3 com 35 °C ou mais. Viagem mais longa que isso sai da lista.

A retirada na loja, em Ilhéus, aparece sempre.

Quando o pedido é pago, a nota interna do pedido, que a loja vê no painel da Nuvemshop, ganha uma linha assim:

> [Frete que não derrete] Despachar segunda, 09/11. Não despachar antes: a viagem pararia num fim de semana ou feriado. Caixa térmica com 2 gelos recicláveis.

## Por que Nuvemshop

- **É onde a loja já vende.** Pix, cartão e boleto pelo Nuvem Pago, emissão de etiqueta e o app no celular da dona: trocar de plataforma por causa do frete seria trocar tudo.
- **O app vira a transportadora.** A Shipping Carrier API manda o carrinho inteiro para o app em cada cotação e mostra no checkout as opções que ele devolver, com preço, prazo e código. É o ponto exato onde a regra precisa morar. Mensagem na página do produto ou desconto no carrinho não resolvem.
- **O pedido carrega a decisão.** A opção escolhida volta no pedido com a referência que o app deu (`shipping.option.reference`), e a nota interna (`owner_note`) aceita escrita pela API. A instrução de expedição chega a quem embala sem planilha paralela.

### O que ficou de fora

- **Frete fixo por região na própria Nuvemshop.** Não sabe da previsão do tempo, do produto nem do dia da semana. Para não derreter no pior caso, cobraria caixa térmica de todo mundo.
- **App de frete pronto (cotação de várias transportadoras).** Escolhe o mais barato ou o mais rápido. Nenhum tira da lista a opção que derrete o chocolate.
- **Shopify.** Faria o mesmo com Carrier Service, mas a loja teria de migrar catálogo, clientes e meios de pagamento.

### Por que Cloudflare Workers

A Nuvemshop espera a cotação por até 5 segundos e conta como falha o que passar disso. O Worker roda perto do comprador, sem servidor ligado esperando e sem partida a frio. O Workers KV guarda o token de cada loja e a previsão do tempo. Um Cron Trigger busca a previsão de 3 em 3 horas, então a cotação nunca espera por ela.

## Decisões

- **Na dúvida, calor.** Sem previsão para algum dia da viagem (previsão com mais de 12 horas, viagem além dos 16 dias previstos), a conta supõe o pior calor. Produto com SKU fora da lista é tratado como recheado.
- **A capital representa o estado.** A previsão das 27 capitais vem numa requisição só ao Open-Meteo. Previsão por cidade exigiria uma consulta por CEP, sem tempo nos 5 segundos da cotação.
- **Os feriados que param o transporte** são os nacionais, mais o Carnaval e Corpus Christi, calculados a partir da Páscoa.
- **Avisos respondem rápido.** A Nuvemshop espera a resposta de um webhook por 3 segundos. O app confere a assinatura HMAC, responde e só depois escreve a nota (`waitUntil`). Se o aviso chega duas vezes, a nota não se repete.
- **LGPD.** O app guarda só o token da loja. Na desinstalação ou em `store/redact`, apaga o token. Dos clientes, não guarda nada.
- **Erro de negócio é 422.** CEP inválido ou carrinho vazio respondem 422, que a Nuvemshop guarda por um minuto e não conta como falha do serviço.

## Como funciona

```
src/
  dominio/            regras puras: calendário, CEP → estado, previsão, cotação, nota de expedição
  config/loja.ts      tabela da transportadora, classes dos produtos, limites de calor, caixa e gelo
  nuvemshop/
    frete.ts          callback da Shipping Carrier API: carrinho → tarifas
    webhooks.ts       assinatura HMAC, pedido pago, desinstalação, LGPD
    instalacao.ts     OAuth, transportadora, opções de frete e webhooks
    api.ts            cliente da API REST (versão 2025-03), com espera no limite de requisições
  clima/previsao.ts   Open-Meteo, 27 capitais numa requisição
  worker.ts           rotas do Worker e o cron
tests/                41 testes
demo/                 a etapa de frete do checkout, simulada no navegador com o mesmo código
```

## Rodar

Precisa de Node 22.18 ou mais novo.

```bash
npm install
npm test
npm run tipos
```

A demonstração usa o código de `src/` sem os tipos, gerado pelo próprio Node:

```bash
npm run demo
```

A pasta `.demo/` sai pronta para qualquer servidor de arquivos. As fotos dos produtos vêm do portfólio.

## Publicar

1. Crie o app no [Portal de Parceiros da Nuvemshop](https://partners.nuvemshop.com.br), com a URL de redirecionamento `https://<seu-worker>/instalar`. Peça acesso à API de transportadoras (Shipping Carrier), que é liberada pela equipe da Nuvemshop.
2. Crie o namespace KV e troque o id em `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create ARMAZEM
   ```

3. Ponha o id do app e o endereço do Worker em `wrangler.toml`. O segredo vai pelo terminal e nunca entra no repositório:

   ```bash
   npx wrangler secret put NUVEMSHOP_CLIENT_SECRET
   ```

4. `npm run publicar`. Ao instalar o app, a loja passa a ter a transportadora "Frete que não derrete" com cinco opções, mais os avisos de pedido pago e de desinstalação.

A previsão do Open-Meteo é gratuita para uso não comercial. Para uma loja de verdade, o Open-Meteo tem plano comercial.

## Créditos

Previsão do tempo: [Open-Meteo](https://open-meteo.com), CC BY 4.0. Fontes Gloock e Albert Sans (SIL Open Font License 1.1), pelo Fontsource.
