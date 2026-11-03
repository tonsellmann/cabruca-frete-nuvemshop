// A cotação no checkout. A Nuvemshop manda o carrinho para o callback_url da transportadora do
// app e espera as opções de frete em até 5 segundos (mais que isso conta como falha).
// https://tiendanube.github.io/api-documentation/resources/shipping-carrier
import { cotar, type ConfigDaLoja, type ItemDoCarrinho, type Opcao } from '../dominio/cotacao.ts';
import type { Previsao } from '../dominio/clima.ts';
import { referenciaDe } from '../dominio/expedicao.ts';

/** O que interessa do corpo que a Nuvemshop manda. */
export interface PedidoDeCotacao {
  store_id: number | string;
  currency?: string;
  destination?: { postal_code?: string };
  items?: Array<{ sku?: string | null; quantity?: number; grams?: number | string }>;
}

export interface Tarifa {
  name: string;
  code: string;
  price: number;
  currency: 'BRL';
  type: 'ship' | 'pickup';
  min_delivery_date: string;
  max_delivery_date: string;
  reference: string;
  address?: Record<string, string | number>;
  hours?: Array<{ day: number; start: string; end: string }>;
}

/** Dia da Bahia (UTC−3, sem horário de verão) em ISO 8601. */
const dataIso = (dia: string) => `${dia}T00:00:00-03:00`;

export function itensDoPedido(pedido: PedidoDeCotacao): ItemDoCarrinho[] {
  return (pedido.items ?? []).map((item) => ({
    sku: String(item.sku ?? '').trim().toUpperCase(),
    quantidade: Number(item.quantity) || 0,
    gramas: Number(item.grams) || 0,
  }));
}

export function tarifaDe(opcao: Opcao, config: ConfigDaLoja): Tarifa {
  const tarifa: Tarifa = {
    name: opcao.nome,
    code: opcao.codigo,
    price: opcao.preco,
    currency: 'BRL',
    type: opcao.tipo,
    min_delivery_date: dataIso(opcao.entregaMin),
    max_delivery_date: dataIso(opcao.entregaMax),
    reference: referenciaDe(opcao),
  };
  if (opcao.tipo === 'pickup' && config.retirada) {
    const { endereco, horarios } = config.retirada;
    tarifa.address = {
      address: endereco.rua,
      number: endereco.numero,
      floor: '',
      locality: endereco.bairro,
      city: endereco.cidade,
      province: endereco.uf,
      country: 'BR',
      phone: '',
      zipcode: endereco.cep,
      latitude: endereco.latitude,
      longitude: endereco.longitude,
    };
    tarifa.hours = horarios.map((h) => ({ day: h.dia, start: h.abre, end: h.fecha }));
  }
  return tarifa;
}

export type RespostaDoFrete = { status: 200; corpo: { rates: Tarifa[] } } | { status: 422; corpo: { error: string } };

export function responderCotacao({
  pedido,
  agora,
  config,
  previsao,
}: {
  pedido: PedidoDeCotacao;
  agora: Date;
  config: ConfigDaLoja;
  previsao: Previsao | null;
}): RespostaDoFrete {
  const cotacao = cotar({ itens: itensDoPedido(pedido), cep: pedido.destination?.postal_code, agora, config, previsao });
  // Erro de negócio responde 4xx: a Nuvemshop não conta como falha do serviço e guarda por 1 minuto.
  if (!cotacao.ok) return { status: 422, corpo: { error: cotacao.erro } };
  return { status: 200, corpo: { rates: cotacao.opcoes.map((o) => tarifaDe(o, config)) } };
}
