// Dias como texto "AAAA-MM-DD", sem hora e sem fuso: a conta é de calendário, não de relógio.
// "Dia útil" aqui é dia em que a transportadora roda: segunda a sexta, fora dos feriados nacionais,
// do Carnaval e de Corpus Christi (pontos facultativos em que a coleta e a entrega param).

export type Dia = string;

const DIA_EM_MS = 86_400_000;
const emMs = (dia: Dia) => Date.parse(`${dia}T12:00:00Z`);
const deMs = (ms: number): Dia => new Date(ms).toISOString().slice(0, 10);

export const somarDias = (dia: Dia, dias: number): Dia => deMs(emMs(dia) + dias * DIA_EM_MS);
export const diasEntre = (de: Dia, ate: Dia): number => Math.round((emMs(ate) - emMs(de)) / DIA_EM_MS);
/** 0 é domingo, 6 é sábado. */
export const diaDaSemana = (dia: Dia): number => new Date(emMs(dia)).getUTCDay();

/** Domingo de Páscoa pelo algoritmo de Meeus, Jones e Butcher. */
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaDoMes).padStart(2, '0')}`;
}

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
const cache = new Map<number, Set<Dia>>();

export function feriados(ano: number): Set<Dia> {
  let dias = cache.get(ano);
  if (!dias) {
    const p = pascoa(ano);
    dias = new Set([
      ...FIXOS.map((md) => `${ano}-${md}`),
      somarDias(p, -48), // segunda de Carnaval
      somarDias(p, -47), // terça de Carnaval
      somarDias(p, -2), // Sexta-feira Santa
      somarDias(p, 60), // Corpus Christi
    ]);
    cache.set(ano, dias);
  }
  return dias;
}

export function diaUtil(dia: Dia): boolean {
  const semana = diaDaSemana(dia);
  return semana !== 0 && semana !== 6 && !feriados(Number(dia.slice(0, 4))).has(dia);
}

/** O próprio dia, se for útil, ou o próximo útil. */
export function proximoDiaUtil(dia: Dia): Dia {
  let d = dia;
  while (!diaUtil(d)) d = somarDias(d, 1);
  return d;
}

/** O dia útil que fica `dias` dias úteis depois de `dia`. */
export function somarDiasUteis(dia: Dia, dias: number): Dia {
  let d = dia;
  for (let n = 0; n < dias; n += 1) d = proximoDiaUtil(somarDias(d, 1));
  return d;
}

/** Data e hora no fuso da loja. */
export function agoraNoFuso(agora: Date, fuso: string): { dia: Dia; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}
