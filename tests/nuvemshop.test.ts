import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { armazemNaMemoria, chaveDaLoja } from '../src/armazem.ts';
import { cabruca } from '../src/config/loja.ts';
import { juntarNota, lerReferencia, notaDaExpedicao, referenciaDe } from '../src/dominio/expedicao.ts';
import { clienteDaNuvemshop, type ClienteDaNuvemshop } from '../src/nuvemshop/api.ts';
import { responderCotacao } from '../src/nuvemshop/frete.ts';
import { codigosDeOpcao, configurarLoja, trocarCodigo } from '../src/nuvemshop/instalacao.ts';
import { anotarExpedicao, assinatura, assinaturaValida, tratarAviso } from '../src/nuvemshop/webhooks.ts';
import { CEP, TERCA_DE_MANHA, previsaoCom } from './apoio.ts';

/** O corpo que a Nuvemshop manda ao callback_url (só os campos que o app usa e alguns a mais). */
const pedidoDeCotacao = (cep: string, itens: Array<[string, number, number]>) => ({
  cart_id: 123,
  store_id: 999,
  currency: 'BRL',
  language: 'pt',
  destination: { postal_code: cep, city: 'São Paulo', province: 'São Paulo', country: 'BR' },
  items: itens.map(([sku, quantity, grams], i) => ({ id: i + 1, product_id: 100 + i, name: sku, sku, quantity, grams, price: '29.90', free_shipping: false })),
});

/** Um cliente da API que responde de uma tabela e anota as chamadas. */
function clienteFalso(respostas: Record<string, unknown>): ClienteDaNuvemshop & { chamadas: Array<[string, string, unknown]> } {
  const chamadas: Array<[string, string, unknown]> = [];
  return {
    chamadas,
    async pedir(metodo, caminho, corpo) {
      chamadas.push([metodo, caminho, corpo]);
      const chave = `${metodo} ${caminho}`;
      if (!(chave in respostas)) return (metodo === 'POST' ? { id: chamadas.length } : null) as never;
      return respostas[chave] as never;
    },
  };
}

describe('cotação no checkout', () => {
  const previsao = previsaoCom({ SP: 31 });

  it('devolve as tarifas no formato da Shipping Carrier API', () => {
    const resposta = responderCotacao({ pedido: pedidoDeCotacao(CEP.SP, [['trufa-pist', 1, 160]]), agora: TERCA_DE_MANHA, config: cabruca, previsao });
    expect(resposta.status).toBe(200);
    const [expresso, retirada] = resposta.status === 200 ? resposta.corpo.rates : [];
    expect(expresso).toEqual({
      name: 'Expresso com caixa térmica',
      code: 'expresso-termico',
      price: 54.8,
      currency: 'BRL',
      type: 'ship',
      min_delivery_date: '2026-11-04T00:00:00-03:00',
      max_delivery_date: '2026-11-05T00:00:00-03:00',
      reference: 'v1|expresso-termico|2026-11-03|2|0',
    });
    expect(retirada).toMatchObject({ type: 'pickup', code: 'retirada', price: 0, address: { city: 'Ilhéus', province: 'BA', zipcode: '45653000' } });
    expect(retirada.hours).toHaveLength(6);
  });

  it('responde 422 a erro de negócio, que a Nuvemshop não conta como falha', () => {
    const resposta = responderCotacao({ pedido: pedidoDeCotacao('999', [['TAB-70', 1, 80]]), agora: TERCA_DE_MANHA, config: cabruca, previsao });
    expect(resposta).toEqual({ status: 422, corpo: { error: 'CEP de destino inválido.' } });
  });
});

describe('nota de expedição', () => {
  it('a referência da opção volta inteira', () => {
    const referencia = referenciaDe({ codigo: 'expresso-termico', despacho: '2026-11-09', gelos: 2, esperaPeloDespacho: 3 } as never);
    expect(referencia).toBe('v1|expresso-termico|2026-11-09|2|1');
    expect(lerReferencia(referencia)).toEqual({ codigo: 'expresso-termico', despacho: '2026-11-09', gelos: 2, adiado: true });
    expect(lerReferencia('outro-app:123')).toBeNull();
    expect(lerReferencia(null)).toBeNull();
  });

  it('diz o que montar e quando despachar', () => {
    expect(notaDaExpedicao({ codigo: 'expresso-termico', despacho: '2026-11-09', gelos: 2, adiado: true })).toBe(
      '[Frete que não derrete] Despachar segunda, 09/11. Não despachar antes: a viagem pararia num fim de semana ou feriado. Caixa térmica com 2 gelos recicláveis.',
    );
    expect(notaDaExpedicao({ codigo: 'expresso', despacho: '2026-11-03', gelos: 0, adiado: false })).toBe('[Frete que não derrete] Despachar terça, 03/11. Embalagem comum.');
  });

  it('não repete a nota quando o aviso chega duas vezes', () => {
    expect(juntarNota('Embrulhar para presente', 'nova')).toBe('Embrulhar para presente\nnova');
    expect(juntarNota(null, 'nova')).toBe('nova');
    expect(juntarNota('[Frete que não derrete] Despachar...', 'nova')).toBeNull();
  });

  it('escreve a nota no pedido pago, uma vez só', async () => {
    const cliente = clienteFalso({
      'GET /orders/55/fulfillment-orders': [{ shipping: { option: { code: 'expresso-termico', reference: 'v1|expresso-termico|2026-11-03|2|0' } } }],
      'GET /orders/55': { id: 55, owner_note: 'Cliente pediu cartão' },
    });
    expect(await anotarExpedicao(cliente, 55)).toEqual({
      nota: 'Cliente pediu cartão\n[Frete que não derrete] Despachar terça, 03/11. Caixa térmica com 2 gelos recicláveis.',
    });
    expect(cliente.chamadas.at(-1)).toEqual(['PUT', '/orders/55', { owner_note: 'Cliente pediu cartão\n[Frete que não derrete] Despachar terça, 03/11. Caixa térmica com 2 gelos recicláveis.' }]);

    const deNovo = clienteFalso({
      'GET /orders/55/fulfillment-orders': [{ shipping: { option: { reference: 'v1|expresso-termico|2026-11-03|2|0' } } }],
      'GET /orders/55': { owner_note: 'Cliente pediu cartão\n[Frete que não derrete] Despachar terça, 03/11.' },
    });
    expect(await anotarExpedicao(deNovo, 55)).toEqual({ pulado: 'a nota de expedição já estava no pedido' });
    expect(deNovo.chamadas.some(([metodo]) => metodo === 'PUT')).toBe(false);
  });

  it('deixa em paz o pedido que foi com outro frete', async () => {
    const cliente = clienteFalso({ 'GET /orders/56/fulfillment-orders': [{ shipping: { option: { code: 'pac', reference: null } } }] });
    expect(await anotarExpedicao(cliente, 56)).toEqual({ pulado: 'o frete do pedido não é deste app' });
  });
});

describe('avisos (webhooks)', () => {
  const segredo = 'segredo-de-teste';

  it('confere a assinatura HMAC-SHA256 do corpo', async () => {
    const corpo = '{"store_id":999,"event":"order/paid","id":55}';
    const esperada = createHmac('sha256', segredo).update(corpo).digest('hex');
    expect(await assinatura(corpo, segredo)).toBe(esperada);
    expect(await assinaturaValida(corpo, esperada, segredo)).toBe(true);
    expect(await assinaturaValida(corpo.replace('55', '56'), esperada, segredo)).toBe(false);
    expect(await assinaturaValida(corpo, null, segredo)).toBe(false);
  });

  it('pedido pago vira trabalho para depois da resposta', async () => {
    const armazem = armazemNaMemoria({ [chaveDaLoja(999)]: JSON.stringify({ token: 't', instaladaEm: '' }) });
    const tarefas: Array<Promise<unknown>> = [];
    const cliente = clienteFalso({ 'GET /orders/55/fulfillment-orders': [] });
    const resultado = await tratarAviso({ aviso: { store_id: 999, event: 'order/paid', id: 55 }, armazem, clienteDaLoja: () => cliente, depois: (t) => tarefas.push(t) });
    expect(resultado).toBe('nota de expedição agendada');
    expect(tarefas).toHaveLength(1);
    await Promise.all(tarefas);
    expect(cliente.chamadas[0]).toEqual(['GET', '/orders/55/fulfillment-orders', undefined]);
  });

  it('apaga o token quando a loja desinstala ou pede para apagar os dados', async () => {
    for (const event of ['app/uninstalled', 'store/redact']) {
      const armazem = armazemNaMemoria({ [chaveDaLoja(999)]: '{}' });
      await tratarAviso({ aviso: { store_id: 999, event }, armazem, clienteDaLoja: () => clienteFalso({}), depois: () => {} });
      expect(armazem.dados.size).toBe(0);
    }
  });

  it('responde aos pedidos da LGPD sobre clientes sem guardar nada deles', async () => {
    const armazem = armazemNaMemoria();
    const resultado = await tratarAviso({ aviso: { store_id: 999, event: 'customers/redact' }, armazem, clienteDaLoja: () => clienteFalso({}), depois: () => {} });
    expect(resultado).toBe('nenhum dado de cliente guardado');
  });
});

describe('instalação', () => {
  it('troca o código de autorização pelo token', async () => {
    const enviados: unknown[] = [];
    const buscar = (async (_url: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer', scope: 'write_shipping', user_id: 999 }));
    }) as typeof fetch;
    expect(await trocarCodigo({ codigo: 'abc', clientId: '1', clientSecret: 's', buscar })).toEqual({ lojaId: '999', token: 'tok' });
    expect(enviados[0]).toEqual({ client_id: '1', client_secret: 's', grant_type: 'authorization_code', code: 'abc' });

    const recusa = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
    await expect(trocarCodigo({ codigo: 'velho', clientId: '1', clientSecret: 's', buscar: recusa })).rejects.toThrow(/invalid_grant/);
  });

  it('cadastra a transportadora, as cinco opções e os avisos, e na segunda vez não duplica', async () => {
    expect(codigosDeOpcao(cabruca).map((o) => o.code)).toEqual(['expresso', 'expresso-termico', 'economico', 'economico-termico', 'retirada']);

    const nova = clienteFalso({ 'GET /shipping_carriers': [], 'POST /shipping_carriers': { id: 7, callback_url: 'https://app.exemplo/frete' }, 'GET /shipping_carriers/7/options': [], 'GET /webhooks': [] });
    const primeira = await configurarLoja({ cliente: nova, urlDoApp: 'https://app.exemplo', config: cabruca });
    expect(primeira).toEqual({ transportadora: 7, opcoesCriadas: ['expresso', 'expresso-termico', 'economico', 'economico-termico', 'retirada'], avisosCriados: ['order/paid', 'app/uninstalled'] });
    expect(nova.chamadas[1]).toEqual(['POST', '/shipping_carriers', { name: 'Frete que não derrete', callback_url: 'https://app.exemplo/frete', types: 'ship,pickup' }]);

    const instalada = clienteFalso({
      'GET /shipping_carriers': [{ id: 7, callback_url: 'https://app.exemplo/frete' }],
      'GET /shipping_carriers/7/options': codigosDeOpcao(cabruca),
      'GET /webhooks': [{ event: 'order/paid', url: 'https://app.exemplo/webhooks' }, { event: 'app/uninstalled', url: 'https://app.exemplo/webhooks' }],
    });
    expect(await configurarLoja({ cliente: instalada, urlDoApp: 'https://app.exemplo', config: cabruca })).toEqual({ transportadora: 7, opcoesCriadas: [], avisosCriados: [] });
  });
});

describe('cliente da API', () => {
  it('manda o token, o User-Agent e a versão da API, e espera quando o balde enche', async () => {
    const pedidos: Array<{ url: string; headers: Record<string, string> }> = [];
    let vez = 0;
    const buscar = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, headers: init.headers as Record<string, string> });
      vez += 1;
      return vez === 1 ? new Response('', { status: 429 }) : new Response('{"id":1}');
    }) as typeof fetch;
    const pausas: number[] = [];
    const cliente = clienteDaNuvemshop({ lojaId: 999, token: 'tok', userAgent: 'App (contato@exemplo.com)', buscar, pausa: async (ms) => pausas.push(ms) });
    expect(await cliente.pedir('GET', '/orders/1')).toEqual({ id: 1 });
    expect(pedidos[0].url).toBe('https://api.nuvemshop.com.br/2025-03/999/orders/1');
    expect(pedidos[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'User-Agent': 'App (contato@exemplo.com)' });
    expect(pausas).toEqual([1000]);
  });
});
