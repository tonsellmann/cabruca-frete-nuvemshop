// O app no Cloudflare Workers.
//   POST /frete      cotação do checkout (callback da transportadora)
//   POST /webhooks   avisos da Nuvemshop, assinados
//   GET  /instalar   volta da autorização, com ?code=
//   cron             atualiza a previsão do tempo
import { CHAVE_DA_PREVISAO, chaveDaLoja, lerJson, type Armazem, type Loja } from './armazem.ts';
import { buscarPrevisao } from './clima/previsao.ts';
import { cabruca } from './config/loja.ts';
import type { Previsao } from './dominio/clima.ts';
import { clienteDaNuvemshop } from './nuvemshop/api.ts';
import { responderCotacao, type PedidoDeCotacao } from './nuvemshop/frete.ts';
import { configurarLoja, guardarLoja, trocarCodigo } from './nuvemshop/instalacao.ts';
import { assinaturaValida, tratarAviso, type Aviso } from './nuvemshop/webhooks.ts';

export interface Env {
  ARMAZEM: Armazem;
  NUVEMSHOP_APP_ID: string;
  NUVEMSHOP_CLIENT_SECRET: string;
  /** Endereço público do Worker, sem barra no fim. */
  URL_DO_APP: string;
  /** E-mail de contato que vai no User-Agent, como a Nuvemshop pede. */
  CONTATO: string;
}

interface Contexto {
  waitUntil(tarefa: Promise<unknown>): void;
}

/** O corpo da cotação tem um carrinho; mais que isso não é cotação. */
const LIMITE_DO_CORPO = 256 * 1024;

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const userAgent = (env: Env) => `Frete que nao derrete (${env.CONTATO})`;

async function lerCorpo(pedido: Request): Promise<string | null> {
  const tamanho = Number(pedido.headers.get('content-length') ?? 0);
  if (tamanho > LIMITE_DO_CORPO) return null;
  const texto = await pedido.text();
  return texto.length > LIMITE_DO_CORPO ? null : texto;
}

async function frete(pedido: Request, env: Env, agora: Date): Promise<Response> {
  const corpo = await lerCorpo(pedido);
  if (corpo === null) return json(413, { error: 'Corpo grande demais.' });
  let dados: PedidoDeCotacao;
  try {
    dados = JSON.parse(corpo);
  } catch {
    return json(400, { error: 'JSON inválido.' });
  }
  // Só cota para loja que instalou o app.
  const [loja, previsao] = await Promise.all([
    env.ARMAZEM.get(chaveDaLoja(dados.store_id)),
    lerJson<Previsao>(env.ARMAZEM, CHAVE_DA_PREVISAO),
  ]);
  if (!loja) return json(403, { error: 'Loja sem o app instalado.' });
  const resposta = responderCotacao({ pedido: dados, agora, config: cabruca, previsao });
  return json(resposta.status, resposta.corpo);
}

async function webhooks(pedido: Request, env: Env, contexto: Contexto): Promise<Response> {
  const corpo = await lerCorpo(pedido);
  if (corpo === null) return json(413, { error: 'Corpo grande demais.' });
  if (!(await assinaturaValida(corpo, pedido.headers.get('x-linkedstore-hmac-sha256'), env.NUVEMSHOP_CLIENT_SECRET))) {
    return json(401, { error: 'Assinatura inválida.' });
  }
  let aviso: Aviso;
  try {
    aviso = JSON.parse(corpo);
  } catch {
    return json(400, { error: 'JSON inválido.' });
  }
  const resultado = await tratarAviso({
    aviso,
    armazem: env.ARMAZEM,
    clienteDaLoja: (lojaId, loja: Loja) => clienteDaNuvemshop({ lojaId, token: loja.token, userAgent: userAgent(env) }),
    depois: (tarefa) => contexto.waitUntil(tarefa),
  });
  return json(200, { ok: true, resultado });
}

async function instalar(pedido: Request, env: Env, agora: Date): Promise<Response> {
  const codigo = new URL(pedido.url).searchParams.get('code');
  if (!codigo) return new Response('Faltou o código de autorização.', { status: 400 });
  const { lojaId, token } = await trocarCodigo({ codigo, clientId: env.NUVEMSHOP_APP_ID, clientSecret: env.NUVEMSHOP_CLIENT_SECRET });
  await guardarLoja(env.ARMAZEM, lojaId, token, agora);
  const cliente = clienteDaNuvemshop({ lojaId, token, userAgent: userAgent(env) });
  await configurarLoja({ cliente, urlDoApp: env.URL_DO_APP, config: cabruca });
  return new Response('App instalado. As opções de frete já aparecem no checkout da loja.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default {
  async fetch(pedido: Request, env: Env, contexto: Contexto): Promise<Response> {
    const { pathname } = new URL(pedido.url);
    const agora = new Date();
    try {
      if (pedido.method === 'POST' && pathname === '/frete') return await frete(pedido, env, agora);
      if (pedido.method === 'POST' && pathname === '/webhooks') return await webhooks(pedido, env, contexto);
      if (pedido.method === 'GET' && pathname === '/instalar') return await instalar(pedido, env, agora);
      return new Response('Não encontrado', { status: 404 });
    } catch (erro) {
      console.error(pathname, erro);
      return json(500, { error: 'Erro interno.' });
    }
  },

  async scheduled(_evento: unknown, env: Env): Promise<void> {
    const previsao = await buscarPrevisao(new Date());
    await env.ARMAZEM.put(CHAVE_DA_PREVISAO, JSON.stringify(previsao));
  },
};
