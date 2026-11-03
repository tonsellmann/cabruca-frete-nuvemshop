// Datas, previsões e carrinhos dos testes. Novembro de 2026: dia 2 (segunda) é Finados, 15 é
// domingo e 20 (sexta) é Dia da Consciência Negra.
import type { Previsao } from '../src/dominio/clima.ts';
import type { UF } from '../src/dominio/cep.ts';
import { somarDias } from '../src/dominio/calendario.ts';
import type { ItemDoCarrinho } from '../src/dominio/cotacao.ts';

/** Hora da Bahia (UTC−3) como Date. */
export const naBahia = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

/** Terça, 3 de novembro de 2026, 9h em Ilhéus: antes do corte das 11h. */
export const TERCA_DE_MANHA = naBahia('2026-11-03', '09:00');

/** Máxima constante por estado nos 16 dias a partir de 2 de novembro. */
export function previsaoCom(maximas: Partial<Record<UF, number>>, atualizadaEm = '2026-11-03T06:00:00Z'): Previsao {
  const resultado: Previsao['maximas'] = {};
  for (const [uf, t] of Object.entries(maximas) as Array<[UF, number]>) {
    const dias: Record<string, number> = {};
    for (let i = 0; i < 16; i += 1) dias[somarDias('2026-11-02', i)] = t;
    resultado[uf] = dias;
  }
  return { atualizadaEm, maximas: resultado };
}

const PESOS: Record<string, number> = {
  'TAB-70': 80, 'TAB-85': 80, 'TAB-100': 80, 'TAB-CRAVO': 80, 'KIT-DEG': 450,
  'LASCAS-CAST': 150, 'DRAG-CAFE': 120, 'BOMBOM-9': 140, 'TRUFA-PIST': 160,
  NIBS: 150, 'PO-50': 200, 'MEL-CACAU': 250,
};

export const carrinho = (...skus: Array<string | [string, number]>): ItemDoCarrinho[] =>
  skus.map((s) => {
    const [sku, quantidade] = Array.isArray(s) ? s : [s, 1];
    return { sku, quantidade, gramas: PESOS[sku] ?? 100 };
  });

/** CEPs de exemplo por estado. */
export const CEP = { SP: '01310-100', RS: '90010-000', MT: '78005-000', AM: '69005-000', BA: '40010-000', ILHEUS: '45653-000' };
