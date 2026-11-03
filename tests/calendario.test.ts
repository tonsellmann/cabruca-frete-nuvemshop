import { describe, expect, it } from 'vitest';
import { agoraNoFuso, diaUtil, feriados, pascoa, proximoDiaUtil, somarDiasUteis } from '../src/dominio/calendario.ts';
import { limparCep, ufDoCep } from '../src/dominio/cep.ts';
import { maximaNaJanela } from '../src/dominio/clima.ts';
import { previsaoCom } from './apoio.ts';

describe('calendário', () => {
  it('acha a Páscoa e os feriados que dependem dela', () => {
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
    const de2027 = feriados(2027);
    for (const dia of ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27', '2027-11-20']) expect(de2027.has(dia)).toBe(true);
  });

  it('não conta fim de semana nem feriado como dia útil', () => {
    expect(diaUtil('2026-11-02')).toBe(false); // Finados
    expect(diaUtil('2026-11-03')).toBe(true);
    expect(diaUtil('2026-11-07')).toBe(false); // sábado
    expect(proximoDiaUtil('2026-11-20')).toBe('2026-11-23');
  });

  it('soma dias úteis pulando a Consciência Negra e o fim de semana', () => {
    expect(somarDiasUteis('2026-11-19', 1)).toBe('2026-11-23');
    expect(somarDiasUteis('2026-11-03', 3)).toBe('2026-11-06');
  });

  it('lê a hora no fuso da loja', () => {
    expect(agoraNoFuso(new Date('2026-11-03T13:59:00Z'), 'America/Bahia')).toEqual({ dia: '2026-11-03', minutos: 10 * 60 + 59 });
    // 1h da manhã do dia 4 em UTC ainda é dia 3 em Ilhéus
    expect(agoraNoFuso(new Date('2026-11-04T01:00:00Z'), 'America/Bahia').dia).toBe('2026-11-03');
  });
});

describe('CEP', () => {
  it('acha o estado pelas faixas dos Correios', () => {
    expect(ufDoCep('45653-000')).toBe('BA');
    expect(ufDoCep('01310100')).toBe('SP');
    expect(ufDoCep('69301-000')).toBe('RR');
    expect(ufDoCep('69900-000')).toBe('AC');
    expect(ufDoCep('72800-000')).toBe('GO');
    expect(ufDoCep('73100-000')).toBe('DF');
  });

  it('recusa CEP incompleto ou fora das faixas', () => {
    expect(limparCep('4565-000')).toBeNull();
    expect(ufDoCep('00000-000')).toBeNull();
    expect(ufDoCep(undefined)).toBeNull();
  });
});

describe('previsão', () => {
  const agora = new Date('2026-11-03T12:00:00Z');

  it('pega a maior máxima entre o despacho e a entrega', () => {
    const previsao = previsaoCom({ SP: 26 });
    previsao.maximas.SP!['2026-11-05'] = 33;
    expect(maximaNaJanela(previsao, 'SP', '2026-11-03', '2026-11-05', agora)).toBe(33);
    expect(maximaNaJanela(previsao, 'SP', '2026-11-03', '2026-11-04', agora)).toBe(26);
  });

  it('sem previsão para algum dia da viagem, não chuta', () => {
    expect(maximaNaJanela(previsaoCom({ SP: 26 }), 'SP', '2026-11-15', '2026-11-20', agora)).toBeNull();
    expect(maximaNaJanela(previsaoCom({ SP: 26 }), 'RJ', '2026-11-03', '2026-11-04', agora)).toBeNull();
    expect(maximaNaJanela(null, 'SP', '2026-11-03', '2026-11-04', agora)).toBeNull();
  });

  it('previsão com mais de 12 horas não vale', () => {
    const velha = previsaoCom({ SP: 20 }, '2026-11-02T20:00:00Z');
    expect(maximaNaJanela(velha, 'SP', '2026-11-03', '2026-11-04', agora)).toBeNull();
  });
});
