// Os avisos da Nuvemshop: pedido pago, app desinstalado e os três pedidos da LGPD.
// https://tiendanube.github.io/api-documentation/resources/webhook
//   - assinatura HMAC-SHA256 do corpo, com o segredo do app, no cabeçalho x-linkedstore-hmac-sha256
//   - a resposta 2xx precisa sair em até 3 segundos; sem ela, a Nuvemshop reenvia por 48 horas
import { chaveDaLoja, lerJson, type Armazem, type Loja } from '../armazem.ts';
import { juntarNota, lerReferencia, notaDaExpedicao } from '../dominio/expedicao.ts';
import type { ClienteDaNuvemshop } from './api.ts';

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function assinatura(corpo: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)));
}

/** Compara sem parar no primeiro caractere diferente, para o tempo não entregar a assinatura. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function assinaturaValida(corpo: string, recebida: string | null, segredo: string): Promise<boolean> {
  if (!recebida) return false;
  return iguais(await assinatura(corpo, segredo), recebida.trim().toLowerCase());
}

export interface Aviso {
  store_id: number | string;
  event: string;
  id?: number | string;
}

interface PedidoDeEnvio {
  shipping?: { option?: { code?: string; reference?: string | null } };
}

/**
 * Pedido pago: lê a referência que a cotação deixou na opção de frete e escreve a nota de
 * expedição no pedido. Devolve a nota escrita, ou o motivo de não ter escrito.
 */
export async function anotarExpedicao(cliente: ClienteDaNuvemshop, pedidoId: number | string): Promise<{ nota: string } | { pulado: string }> {
  const envios = await cliente.pedir<PedidoDeEnvio[]>('GET', `/orders/${pedidoId}/fulfillment-orders`);
  const expedicao = (envios ?? []).map((e) => lerReferencia(e.shipping?.option?.reference)).find(Boolean);
  if (!expedicao) return { pulado: 'o frete do pedido não é deste app' };

  const pedido = await cliente.pedir<{ owner_note?: string | null }>('GET', `/orders/${pedidoId}`);
  const nota = juntarNota(pedido?.owner_note, notaDaExpedicao(expedicao));
  if (nota === null) return { pulado: 'a nota de expedição já estava no pedido' };
  await cliente.pedir('PUT', `/orders/${pedidoId}`, { owner_note: nota });
  return { nota };
}

/**
 * Decide o que fazer com um aviso já autenticado. O trabalho que chama a API vai para `depois`,
 * que roda depois da resposta: a Nuvemshop só espera 3 segundos.
 */
export async function tratarAviso({
  aviso,
  armazem,
  clienteDaLoja,
  depois,
}: {
  aviso: Aviso;
  armazem: Armazem;
  clienteDaLoja: (lojaId: string | number, loja: Loja) => ClienteDaNuvemshop;
  depois: (tarefa: Promise<unknown>) => void;
}): Promise<string> {
  switch (aviso.event) {
    case 'order/paid': {
      const loja = await lerJson<Loja>(armazem, chaveDaLoja(aviso.store_id));
      if (!loja || aviso.id === undefined) return 'ignorado: loja não instalada';
      depois(
        anotarExpedicao(clienteDaLoja(aviso.store_id, loja), aviso.id).catch((erro) => {
          console.error(`pedido ${aviso.id} da loja ${aviso.store_id}:`, erro);
        }),
      );
      return 'nota de expedição agendada';
    }
    // Desinstalou, ou pediu para apagar os dados da loja: o app só guarda o token.
    case 'app/uninstalled':
    case 'store/redact':
      await armazem.delete(chaveDaLoja(aviso.store_id));
      return 'dados da loja apagados';
    // O app não guarda nada de cliente: não há o que apagar nem o que entregar.
    case 'customers/redact':
    case 'customers/data_request':
      return 'nenhum dado de cliente guardado';
    default:
      return `ignorado: ${aviso.event}`;
  }
}
