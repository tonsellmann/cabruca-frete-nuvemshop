// Busca a máxima prevista para os próximos 16 dias nas 27 capitais, numa requisição só ao
// Open-Meteo, e guarda. Roda de 3 em 3 horas (Cron Trigger do Worker), para a cotação nunca
// esperar pela previsão.
// https://open-meteo.com/en/docs
import { CAPITAIS, type Previsao } from '../dominio/clima.ts';
import type { UF } from '../dominio/cep.ts';

const UFS = Object.keys(CAPITAIS) as UF[];

export function urlDaPrevisao(): string {
  const parametros = new URLSearchParams({
    latitude: UFS.map((uf) => CAPITAIS[uf].latitude).join(','),
    longitude: UFS.map((uf) => CAPITAIS[uf].longitude).join(','),
    daily: 'temperature_2m_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '16',
  });
  return `https://api.open-meteo.com/v1/forecast?${parametros}`;
}

interface Local {
  daily?: { time?: string[]; temperature_2m_max?: Array<number | null> };
}

/** Com várias coordenadas, o Open-Meteo devolve uma lista na mesma ordem. */
export function lerPrevisao(resposta: Local | Local[], agora: Date): Previsao {
  const locais = Array.isArray(resposta) ? resposta : [resposta];
  if (locais.length !== UFS.length) throw new Error(`a previsão veio com ${locais.length} lugares; eram ${UFS.length}`);
  const maximas: Previsao['maximas'] = {};
  locais.forEach((local, i) => {
    const dias = local.daily?.time ?? [];
    const temperaturas = local.daily?.temperature_2m_max ?? [];
    const porDia: Record<string, number> = {};
    dias.forEach((dia, j) => {
      const t = temperaturas[j];
      if (typeof t === 'number') porDia[dia] = t;
    });
    maximas[UFS[i]] = porDia;
  });
  return { atualizadaEm: agora.toISOString(), maximas };
}

export async function buscarPrevisao(agora: Date, buscar: typeof fetch = fetch): Promise<Previsao> {
  const resposta = await buscar(urlDaPrevisao());
  if (!resposta.ok) throw new Error(`Open-Meteo respondeu ${resposta.status}`);
  return lerPrevisao(await resposta.json(), agora);
}
