import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { armazemNaMemoria, chaveDaLoja, CHAVE_DA_PREVISAO } from '../src/armazem.ts';
import { lerPrevisao, urlDaPrevisao } from '../src/clima/previsao.ts';
import worker, { type Env } from '../src/worker.ts';
import { CEP, previsaoCom } from './apoio.ts';

const SEGREDO = 'segredo-de-teste';
const env = (armazem = armazemNaMemoria()): Env => ({
  ARMAZEM: armazem,
  NUVEMSHOP_APP_ID: '1234',
  NUVEMSHOP_CLIENT_SECRET: SEGREDO,
  URL_DO_APP: 'https://frete.exemplo',
  CONTATO: 'contato@exemplo.com',
});
const contexto = (tarefas: Array<Promise<unknown>> = []) => ({ waitUntil: (t: Promise<unknown>) => tarefas.push(t) });
const instalada = () => armazemNaMemoria({ [chaveDaLoja(999)]: JSON.stringify({ token: 'tok', instaladaEm: '' }) });

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe('worker', () => {
  it('cota o frete para loja instalada', async () => {
    const armazem = instalada();
    await armazem.put(CHAVE_DA_PREVISAO, JSON.stringify(previsaoCom({ SP: 31 }, new Date().toISOString())));
    const corpo = JSON.stringify({ store_id: 999, destination: { postal_code: CEP.SP }, items: [{ sku: 'NIBS', quantity: 2, grams: 150 }] });
    const resposta = await worker.fetch(new Request('https://frete.exemplo/frete', { method: 'POST', body: corpo }), env(armazem), contexto());
    expect(resposta.status).toBe(200);
    const { rates } = (await resposta.json()) as { rates: Array<{ code: string }> };
    expect(rates.map((r) => r.code)).toEqual(['expresso', 'economico', 'retirada']);
  });

  it('não cota para loja que não instalou o app', async () => {
    const corpo = JSON.stringify({ store_id: 1, destination: { postal_code: CEP.SP }, items: [] });
    const resposta = await worker.fetch(new Request('https://frete.exemplo/frete', { method: 'POST', body: corpo }), env(), contexto());
    expect(resposta.status).toBe(403);
  });

  it('recusa aviso sem a assinatura certa', async () => {
    const corpo = JSON.stringify({ store_id: 999, event: 'app/uninstalled' });
    const pedido = new Request('https://frete.exemplo/webhooks', { method: 'POST', body: corpo, headers: { 'x-linkedstore-hmac-sha256': 'falsa' } });
    const armazem = instalada();
    expect((await worker.fetch(pedido, env(armazem), contexto())).status).toBe(401);
    expect(armazem.dados.size).toBe(1);
  });

  it('responde ao pedido pago na hora e escreve a nota depois', async () => {
    const chamadas: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      chamadas.push(`${init?.method} ${url}`);
      if (String(url).endsWith('/fulfillment-orders')) return new Response(JSON.stringify([{ shipping: { option: { reference: 'v1|expresso|2026-11-03|0|0' } } }]));
      if (init?.method === 'GET') return new Response(JSON.stringify({ owner_note: '' }));
      return new Response('{}');
    }) as typeof fetch;

    const corpo = JSON.stringify({ store_id: 999, event: 'order/paid', id: 55 });
    const assinatura = createHmac('sha256', SEGREDO).update(corpo).digest('hex');
    const tarefas: Array<Promise<unknown>> = [];
    const pedido = new Request('https://frete.exemplo/webhooks', { method: 'POST', body: corpo, headers: { 'x-linkedstore-hmac-sha256': assinatura } });
    const resposta = await worker.fetch(pedido, env(instalada()), contexto(tarefas));
    expect(resposta.status).toBe(200);
    await Promise.all(tarefas);
    expect(chamadas).toEqual([
      'GET https://api.nuvemshop.com.br/2025-03/999/orders/55/fulfillment-orders',
      'GET https://api.nuvemshop.com.br/2025-03/999/orders/55',
      'PUT https://api.nuvemshop.com.br/2025-03/999/orders/55',
    ]);
  });

  it('não aceita corpo gigante', async () => {
    const pedido = new Request('https://frete.exemplo/frete', { method: 'POST', body: 'x'.repeat(300 * 1024) });
    expect((await worker.fetch(pedido, env(instalada()), contexto())).status).toBe(413);
  });
});

describe('previsão do tempo', () => {
  it('pede as 27 capitais numa requisição só', () => {
    const url = new URL(urlDaPrevisao());
    expect(url.searchParams.get('latitude')!.split(',')).toHaveLength(27);
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max');
  });

  it('lê a resposta do Open-Meteo na ordem das capitais', () => {
    const locais = Array.from({ length: 27 }, (_, i) => ({ daily: { time: ['2026-11-03', '2026-11-04'], temperature_2m_max: [20 + i, null] } }));
    const previsao = lerPrevisao(locais, new Date('2026-11-03T06:00:00Z'));
    expect(previsao.maximas.AC).toEqual({ '2026-11-03': 20 });
    expect(previsao.maximas.BA).toEqual({ '2026-11-03': 24 });
    expect(() => lerPrevisao(locais.slice(1), new Date())).toThrow(/26 lugares/);
  });
});
