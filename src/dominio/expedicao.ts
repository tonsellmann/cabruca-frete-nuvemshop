// O que a cotação combinou com o cliente precisa chegar a quem embala. A opção de frete leva uma
// referência curta, que a Nuvemshop guarda no pedido; quando o pedido é pago, a referência vira
// uma nota interna: que caixa usar, quantos gelos e em que dia despachar.
import type { Dia } from './calendario.ts';
import type { Opcao } from './cotacao.ts';

export const MARCA_DA_NOTA = '[Frete que não derrete]';

export interface Expedicao {
  codigo: string;
  despacho: Dia;
  gelos: number;
  /** O despacho foi adiado para a viagem não parar em fim de semana ou feriado. */
  adiado: boolean;
}

/** "v1|expresso-termico|2026-11-09|3|1" */
export function referenciaDe(opcao: Opcao): string {
  return ['v1', opcao.codigo, opcao.despacho, opcao.gelos, opcao.esperaPeloDespacho > 0 ? 1 : 0].join('|');
}

export function lerReferencia(referencia: unknown): Expedicao | null {
  if (typeof referencia !== 'string') return null;
  const [versao, codigo, despacho, gelos, adiado] = referencia.split('|');
  if (versao !== 'v1' || !codigo || !/^\d{4}-\d{2}-\d{2}$/.test(despacho ?? '') || !/^\d+$/.test(gelos ?? '')) return null;
  return { codigo, despacho, gelos: Number(gelos), adiado: adiado === '1' };
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function diaPorExtenso(dia: Dia): string {
  const [, mes, d] = dia.split('-');
  return `${SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${d}/${mes}`;
}

/** A nota que vai para o pedido, no painel da Nuvemshop. */
export function notaDaExpedicao(expedicao: Expedicao): string {
  const partes = [MARCA_DA_NOTA];
  if (expedicao.codigo === 'retirada') {
    partes.push('Cliente retira na loja. Guardar o pedido na geladeira da expedição.');
    return partes.join(' ');
  }
  partes.push(`Despachar ${diaPorExtenso(expedicao.despacho)}.`);
  if (expedicao.adiado) partes.push('Não despachar antes: a viagem pararia num fim de semana ou feriado.');
  partes.push(
    expedicao.gelos > 0
      ? `Caixa térmica com ${expedicao.gelos} ${expedicao.gelos === 1 ? 'gelo reciclável' : 'gelos recicláveis'}.`
      : 'Embalagem comum.',
  );
  return partes.join(' ');
}

/** A nota do pedido com a da expedição no fim, sem repetir se o aviso chegar duas vezes. */
export function juntarNota(notaAtual: unknown, nova: string): string | null {
  const atual = typeof notaAtual === 'string' ? notaAtual.trim() : '';
  if (atual.includes(MARCA_DA_NOTA)) return null;
  return atual ? `${atual}\n${nova}` : nova;
}
