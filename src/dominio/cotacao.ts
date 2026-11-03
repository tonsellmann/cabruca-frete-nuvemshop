// A cotação do frete que não derrete. Pura: sem Nuvemshop, sem rede e sem relógio; quem chama
// passa o carrinho, o CEP, a hora da compra, a configuração da loja e a previsão.
//
// Para cada serviço de entrega, três perguntas:
//   1. Quando o pacote sai? Chocolate não pode passar fim de semana nem feriado parado no galpão
//      da transportadora, então o despacho espera o primeiro dia em que a viagem inteira cabe em
//      dias úteis seguidos.
//   2. Que calor ele pega? A maior máxima prevista no estado de destino, do despacho à entrega.
//   3. Precisa de caixa térmica? Se o calor passa do limite do produto mais sensível do carrinho,
//      sim, com um gelo reciclável por dia de viagem. A caixa segura poucos dias: serviço mais
//      lento que isso sai da lista.
import { agoraNoFuso, diaUtil, diasEntre, proximoDiaUtil, somarDias, somarDiasUteis, type Dia } from './calendario.ts';
import { ufDoCep, type UF } from './cep.ts';
import { maximaNaJanela, type Previsao } from './clima.ts';

/** Do que menos ao que mais sofre com calor. */
export const CLASSES = ['nao-derrete', 'amolece', 'derrete'] as const;
export type Classe = (typeof CLASSES)[number];

export type Zona = 'bahia' | 'nordeste' | 'sudeste' | 'centro-sul' | 'norte';

export interface Servico {
  codigo: string;
  nome: string;
  /** Dias úteis, do despacho à entrega: [mínimo, máximo]. */
  prazos: Record<Zona, [number, number]>;
  /** Preço até 1 kg e por quilo a mais (frações contam como quilo inteiro). */
  precos: Record<Zona, { ate1kg: number; kgAdicional: number }>;
}

export interface Retirada {
  codigo: string;
  nome: string;
  endereco: { rua: string; numero: string; bairro: string; cidade: string; uf: UF; cep: string; latitude: number; longitude: number };
  /** Dia da semana (0 é domingo) e horário "HHMM". */
  horarios: Array<{ dia: number; abre: string; fecha: string }>;
}

export interface ConfigDaLoja {
  fuso: string;
  /** Pedido pago até essa hora (minutos do dia) num dia útil sai no mesmo dia. */
  corteDoDespacho: number;
  zonas: Record<UF, Zona>;
  servicos: Servico[];
  retirada: Retirada | null;
  /** Classe de cada SKU. SKU fora da lista é tratado como o mais sensível. */
  classes: Record<string, Classe>;
  /** Acima dessa máxima prevista, a classe precisa de caixa térmica. */
  limites: Record<Exclude<Classe, 'nao-derrete'>, number>;
  caixa: {
    preco: number;
    gramas: number;
    /** Dias corridos, do despacho à entrega, que a caixa com gelo segura. */
    diasQueSegura: number;
    /** A partir dessa máxima, a caixa segura menos. */
    calorExtremo: number;
    diasQueSeguraNoExtremo: number;
  };
  gelo: { preco: number; gramas: number };
}

export interface ItemDoCarrinho {
  sku: string;
  quantidade: number;
  gramas: number;
}

export interface Opcao {
  codigo: string;
  nome: string;
  tipo: 'ship' | 'pickup';
  preco: number;
  despacho: Dia;
  entregaMin: Dia;
  entregaMax: Dia;
  caixaTermica: boolean;
  gelos: number;
  /** Maior máxima prevista na viagem; null quando não havia previsão (tratada como calor). */
  maxima: number | null;
  /** Quantos dias o despacho esperou para a viagem não pegar fim de semana ou feriado. */
  esperaPeloDespacho: number;
}

export interface Descarte {
  servico: string;
  motivo: string;
}

export type Cotacao =
  | { ok: true; uf: UF; zona: Zona; classe: Classe; gramas: number; opcoes: Opcao[]; descartes: Descarte[] }
  | { ok: false; erro: string };

export function classeDoCarrinho(itens: ItemDoCarrinho[], classes: Record<string, Classe>): Classe {
  let pior = 0;
  for (const item of itens) {
    const classe = classes[item.sku] ?? 'derrete';
    pior = Math.max(pior, CLASSES.indexOf(classe));
  }
  return CLASSES[pior];
}

/** O primeiro dia em que o pacote pode sair: hoje, se for dia útil antes do corte. */
export function primeiroDespacho(agora: Date, config: Pick<ConfigDaLoja, 'fuso' | 'corteDoDespacho'>): Dia {
  const { dia, minutos } = agoraNoFuso(agora, config.fuso);
  if (diaUtil(dia) && minutos < config.corteDoDespacho) return dia;
  return proximoDiaUtil(somarDias(dia, 1));
}

/**
 * O primeiro despacho, a partir de `desde`, em que a viagem de até `dias` dias úteis não atravessa
 * fim de semana nem feriado. Viagem de cinco dias úteis ou mais sempre atravessa: null.
 */
export function despachoSemParada(desde: Dia, dias: number): Dia | null {
  let despacho = proximoDiaUtil(desde);
  for (let tentativa = 0; tentativa < 15; tentativa += 1) {
    if (diasEntre(despacho, somarDiasUteis(despacho, dias)) === dias) return despacho;
    despacho = proximoDiaUtil(somarDias(despacho, 1));
  }
  return null;
}

const reais = (valor: number) => Math.round(valor * 100) / 100;

function precoDoServico(servico: Servico, zona: Zona, gramas: number): number {
  const { ate1kg, kgAdicional } = servico.precos[zona];
  const quilosAMais = Math.max(0, Math.ceil(gramas / 1000) - 1);
  return reais(ate1kg + quilosAMais * kgAdicional);
}

export function cotar({
  itens,
  cep,
  agora,
  config,
  previsao,
}: {
  itens: ItemDoCarrinho[];
  cep: unknown;
  agora: Date;
  config: ConfigDaLoja;
  previsao: Previsao | null;
}): Cotacao {
  const uf = ufDoCep(cep);
  if (!uf) return { ok: false, erro: 'CEP de destino inválido.' };
  if (!itens.length) return { ok: false, erro: 'Carrinho vazio.' };

  const zona = config.zonas[uf];
  const classe = classeDoCarrinho(itens, config.classes);
  const gramas = itens.reduce((soma, i) => soma + Math.max(0, i.gramas) * Math.max(0, i.quantidade), 0);
  const desde = primeiroDespacho(agora, config);
  const opcoes: Opcao[] = [];
  const descartes: Descarte[] = [];

  for (const servico of config.servicos) {
    const [min, max] = servico.prazos[zona];

    if (classe === 'nao-derrete') {
      opcoes.push({
        codigo: servico.codigo,
        nome: servico.nome,
        tipo: 'ship',
        preco: precoDoServico(servico, zona, gramas),
        despacho: desde,
        entregaMin: somarDiasUteis(desde, min),
        entregaMax: somarDiasUteis(desde, max),
        caixaTermica: false,
        gelos: 0,
        maxima: null,
        esperaPeloDespacho: 0,
      });
      continue;
    }

    const despacho = despachoSemParada(desde, max);
    if (!despacho) {
      descartes.push({ servico: servico.nome, motivo: `leva até ${max} dias úteis e sempre passaria um fim de semana parado no galpão` });
      continue;
    }
    const entregaMax = somarDiasUteis(despacho, max);
    const maxima = maximaNaJanela(previsao, uf, despacho, entregaMax, agora);
    const limite = config.limites[classe];
    const precisaDeCaixa = maxima === null || maxima > limite;

    let caixaTermica = false;
    let gelos = 0;
    let gramasDoPacote = gramas;
    let adicional = 0;
    if (precisaDeCaixa) {
      const extremo = maxima === null || maxima >= config.caixa.calorExtremo;
      const segura = extremo ? config.caixa.diasQueSeguraNoExtremo : config.caixa.diasQueSegura;
      const viagem = diasEntre(despacho, entregaMax);
      if (viagem > segura) {
        const calor = maxima === null ? 'sem previsão do tempo para a viagem inteira' : `${Math.round(maxima)} °C previstos`;
        descartes.push({ servico: servico.nome, motivo: `${calor}, e a caixa térmica segura ${segura} dias; a viagem leva até ${viagem}` });
        continue;
      }
      caixaTermica = true;
      gelos = Math.max(1, viagem);
      gramasDoPacote += config.caixa.gramas + gelos * config.gelo.gramas;
      adicional = config.caixa.preco + gelos * config.gelo.preco;
    }

    opcoes.push({
      codigo: caixaTermica ? `${servico.codigo}-termico` : servico.codigo,
      nome: caixaTermica ? `${servico.nome} com caixa térmica` : servico.nome,
      tipo: 'ship',
      preco: reais(precoDoServico(servico, zona, gramasDoPacote) + adicional),
      despacho,
      entregaMin: somarDiasUteis(despacho, min),
      entregaMax,
      caixaTermica,
      gelos,
      maxima,
      esperaPeloDespacho: diasEntre(desde, despacho),
    });
  }

  if (config.retirada) {
    opcoes.push({
      codigo: config.retirada.codigo,
      nome: config.retirada.nome,
      tipo: 'pickup',
      preco: 0,
      despacho: desde,
      entregaMin: desde,
      entregaMax: somarDiasUteis(desde, 1),
      caixaTermica: false,
      gelos: 0,
      maxima: null,
      esperaPeloDespacho: 0,
    });
  }

  return { ok: true, uf, zona, classe, gramas, opcoes, descartes };
}
