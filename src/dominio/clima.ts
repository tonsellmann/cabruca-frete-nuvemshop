// A previsão de temperatura máxima por estado. A conta usa a capital como referência do estado: a
// Nuvemshop espera a cotação em até 5 segundos, então a previsão é buscada antes, para as 27
// capitais de uma vez, e guardada (veja src/clima/previsao.ts).
import { somarDias, type Dia } from './calendario.ts';
import type { UF } from './cep.ts';

export const CAPITAIS: Record<UF, { cidade: string; latitude: number; longitude: number }> = {
  AC: { cidade: 'Rio Branco', latitude: -9.97, longitude: -67.81 },
  AL: { cidade: 'Maceió', latitude: -9.67, longitude: -35.74 },
  AP: { cidade: 'Macapá', latitude: 0.03, longitude: -51.07 },
  AM: { cidade: 'Manaus', latitude: -3.12, longitude: -60.02 },
  BA: { cidade: 'Salvador', latitude: -12.97, longitude: -38.5 },
  CE: { cidade: 'Fortaleza', latitude: -3.73, longitude: -38.53 },
  DF: { cidade: 'Brasília', latitude: -15.79, longitude: -47.88 },
  ES: { cidade: 'Vitória', latitude: -20.32, longitude: -40.34 },
  GO: { cidade: 'Goiânia', latitude: -16.68, longitude: -49.25 },
  MA: { cidade: 'São Luís', latitude: -2.53, longitude: -44.3 },
  MT: { cidade: 'Cuiabá', latitude: -15.6, longitude: -56.1 },
  MS: { cidade: 'Campo Grande', latitude: -20.47, longitude: -54.62 },
  MG: { cidade: 'Belo Horizonte', latitude: -19.92, longitude: -43.94 },
  PA: { cidade: 'Belém', latitude: -1.46, longitude: -48.5 },
  PB: { cidade: 'João Pessoa', latitude: -7.12, longitude: -34.86 },
  PR: { cidade: 'Curitiba', latitude: -25.43, longitude: -49.27 },
  PE: { cidade: 'Recife', latitude: -8.05, longitude: -34.88 },
  PI: { cidade: 'Teresina', latitude: -5.09, longitude: -42.8 },
  RJ: { cidade: 'Rio de Janeiro', latitude: -22.91, longitude: -43.17 },
  RN: { cidade: 'Natal', latitude: -5.79, longitude: -35.21 },
  RS: { cidade: 'Porto Alegre', latitude: -30.03, longitude: -51.23 },
  RO: { cidade: 'Porto Velho', latitude: -8.76, longitude: -63.9 },
  RR: { cidade: 'Boa Vista', latitude: 2.82, longitude: -60.67 },
  SC: { cidade: 'Florianópolis', latitude: -27.6, longitude: -48.55 },
  SP: { cidade: 'São Paulo', latitude: -23.55, longitude: -46.63 },
  SE: { cidade: 'Aracaju', latitude: -10.91, longitude: -37.07 },
  TO: { cidade: 'Palmas', latitude: -10.18, longitude: -48.33 },
};

/** Máximas previstas por estado e por dia. */
export interface Previsao {
  /** ISO 8601. */
  atualizadaEm: string;
  maximas: Partial<Record<UF, Record<Dia, number>>>;
}

/** Previsão mais velha que isso não vale: a cotação passa a supor calor. */
export const VALIDADE_DA_PREVISAO_MS = 12 * 60 * 60 * 1000;

/**
 * A maior máxima prevista no estado entre dois dias, os dois incluídos. Sem previsão para algum
 * dos dias (previsão velha, estado faltando, viagem além do horizonte), devolve null, e quem chama
 * trata como o pior caso.
 */
export function maximaNaJanela(previsao: Previsao | null, uf: UF, de: Dia, ate: Dia, agora: Date): number | null {
  if (!previsao) return null;
  if (agora.getTime() - Date.parse(previsao.atualizadaEm) > VALIDADE_DA_PREVISAO_MS) return null;
  const dias = previsao.maximas[uf];
  if (!dias) return null;
  let maior = -Infinity;
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    const t = dias[dia];
    if (typeof t !== 'number' || Number.isNaN(t)) return null;
    maior = Math.max(maior, t);
  }
  return maior;
}
