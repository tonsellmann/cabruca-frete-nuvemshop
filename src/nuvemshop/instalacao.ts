// A instalação do app numa loja: troca o código pelo token, cadastra o app como transportadora,
// com uma opção por código de frete, e pede os avisos de pedido pago e de desinstalação.
// Pode rodar de novo na mesma loja: só cria o que falta.
// https://tiendanube.github.io/api-documentation/authentication
// https://tiendanube.github.io/api-documentation/resources/shipping-carrier
// https://tiendanube.github.io/api-documentation/resources/webhook
import { chaveDaLoja, type Armazem, type Loja } from '../armazem.ts';
import type { ConfigDaLoja } from '../dominio/cotacao.ts';
import type { ClienteDaNuvemshop } from './api.ts';

export const URL_DO_TOKEN = 'https://www.nuvemshop.com.br/apps/authorize/token';
export const NOME_DA_TRANSPORTADORA = 'Frete que não derrete';

export async function trocarCodigo({
  codigo,
  clientId,
  clientSecret,
  buscar = fetch,
}: {
  codigo: string;
  clientId: string;
  clientSecret: string;
  buscar?: typeof fetch;
}): Promise<{ lojaId: string; token: string }> {
  const resposta = await buscar(URL_DO_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: codigo }),
  });
  const dados = (await resposta.json().catch(() => ({}))) as { access_token?: string; user_id?: number | string; error?: string };
  if (!resposta.ok || !dados.access_token || dados.user_id === undefined) {
    throw new Error(`a Nuvemshop recusou o código de instalação (${resposta.status} ${dados.error ?? ''})`.trim());
  }
  return { lojaId: String(dados.user_id), token: dados.access_token };
}

/** Os códigos de opção que a cotação pode devolver: cada um precisa existir na transportadora. */
export function codigosDeOpcao(config: ConfigDaLoja): Array<{ code: string; name: string }> {
  const opcoes = config.servicos.flatMap((s) => [
    { code: s.codigo, name: s.nome },
    { code: `${s.codigo}-termico`, name: `${s.nome} com caixa térmica` },
  ]);
  if (config.retirada) opcoes.push({ code: config.retirada.codigo, name: config.retirada.nome });
  return opcoes;
}

interface Transportadora {
  id: number;
  callback_url: string;
}

export async function configurarLoja({
  cliente,
  urlDoApp,
  config,
}: {
  cliente: ClienteDaNuvemshop;
  urlDoApp: string;
  config: ConfigDaLoja;
}): Promise<{ transportadora: number; opcoesCriadas: string[]; avisosCriados: string[] }> {
  const callback = `${urlDoApp}/frete`;
  const existentes = await cliente.pedir<Transportadora[]>('GET', '/shipping_carriers');
  let transportadora = (existentes ?? []).find((t) => t.callback_url === callback);
  if (!transportadora) {
    transportadora = await cliente.pedir<Transportadora>('POST', '/shipping_carriers', {
      name: NOME_DA_TRANSPORTADORA,
      callback_url: callback,
      types: 'ship,pickup',
    });
  }

  const opcoes = await cliente.pedir<Array<{ code: string }>>('GET', `/shipping_carriers/${transportadora.id}/options`);
  const temOpcao = new Set((opcoes ?? []).map((o) => o.code));
  const opcoesCriadas: string[] = [];
  for (const opcao of codigosDeOpcao(config)) {
    if (temOpcao.has(opcao.code)) continue;
    await cliente.pedir('POST', `/shipping_carriers/${transportadora.id}/options`, opcao);
    opcoesCriadas.push(opcao.code);
  }

  const avisos = await cliente.pedir<Array<{ event: string; url: string }>>('GET', '/webhooks');
  const urlDosAvisos = `${urlDoApp}/webhooks`;
  const avisosCriados: string[] = [];
  for (const evento of ['order/paid', 'app/uninstalled']) {
    if ((avisos ?? []).some((a) => a.event === evento && a.url === urlDosAvisos)) continue;
    await cliente.pedir('POST', '/webhooks', { event: evento, url: urlDosAvisos });
    avisosCriados.push(evento);
  }

  return { transportadora: transportadora.id, opcoesCriadas, avisosCriados };
}

export async function guardarLoja(armazem: Armazem, lojaId: string, token: string, agora: Date): Promise<void> {
  const loja: Loja = { token, instaladaEm: agora.toISOString() };
  await armazem.put(chaveDaLoja(lojaId), JSON.stringify(loja));
}
