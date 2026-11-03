import { describe, expect, it } from 'vitest';
import { cabruca } from '../src/config/loja.ts';
import { classeDoCarrinho, cotar, despachoSemParada, primeiroDespacho } from '../src/dominio/cotacao.ts';
import { CEP, TERCA_DE_MANHA, carrinho, naBahia, previsaoCom } from './apoio.ts';

const quentes = previsaoCom({ SP: 31, RS: 22, MT: 38, AM: 33, BA: 28 });
const pedir = (itens: ReturnType<typeof carrinho>, cep: string, agora = TERCA_DE_MANHA, previsao = quentes) =>
  cotar({ itens, cep, agora, config: cabruca, previsao });
const opcao = (cotacao: ReturnType<typeof pedir>, codigo: string) => (cotacao.ok ? cotacao.opcoes.find((o) => o.codigo === codigo) : undefined);
const codigos = (cotacao: ReturnType<typeof pedir>) => (cotacao.ok ? cotacao.opcoes.map((o) => o.codigo) : []);

describe('despacho', () => {
  it('sai no mesmo dia antes das 11h e no próximo dia útil depois', () => {
    expect(primeiroDespacho(naBahia('2026-11-03', '10:59'), cabruca)).toBe('2026-11-03');
    expect(primeiroDespacho(naBahia('2026-11-03', '11:00'), cabruca)).toBe('2026-11-04');
    expect(primeiroDespacho(naBahia('2026-11-06', '15:00'), cabruca)).toBe('2026-11-09');
    expect(primeiroDespacho(naBahia('2026-11-02', '08:00'), cabruca)).toBe('2026-11-03'); // Finados
  });

  it('espera o dia em que a viagem inteira cabe em dias úteis seguidos', () => {
    expect(despachoSemParada('2026-11-03', 2)).toBe('2026-11-03'); // terça a quinta
    expect(despachoSemParada('2026-11-05', 2)).toBe('2026-11-09'); // quinta pegaria o fim de semana
    expect(despachoSemParada('2026-11-19', 2)).toBe('2026-11-23'); // a sexta 20 é feriado
    expect(despachoSemParada('2026-11-03', 5)).toBeNull();
  });
});

describe('classe do carrinho', () => {
  it('vale o produto mais sensível, e SKU desconhecido conta como o pior', () => {
    expect(classeDoCarrinho(carrinho('NIBS', 'PO-50'), cabruca.classes)).toBe('nao-derrete');
    expect(classeDoCarrinho(carrinho('NIBS', 'TAB-70'), cabruca.classes)).toBe('amolece');
    expect(classeDoCarrinho(carrinho('TAB-70', 'TRUFA-PIST'), cabruca.classes)).toBe('derrete');
    expect(classeDoCarrinho(carrinho('LANCAMENTO-NOVO'), cabruca.classes)).toBe('derrete');
  });
});

describe('cotação', () => {
  it('cacau em pó e nibs vão como qualquer pacote, em todos os serviços', () => {
    const c = pedir(carrinho('NIBS', 'PO-50'), CEP.SP);
    expect(codigos(c)).toEqual(['expresso', 'economico', 'retirada']);
    expect(opcao(c, 'expresso')).toMatchObject({ preco: 34.9, despacho: '2026-11-03', entregaMin: '2026-11-04', entregaMax: '2026-11-05', caixaTermica: false });
    expect(opcao(c, 'economico')).toMatchObject({ preco: 21.9, entregaMax: '2026-11-11' });
  });

  it('trufa para São Paulo a 31 °C vai de expresso com caixa térmica e um gelo por dia', () => {
    const c = pedir(carrinho('TRUFA-PIST'), CEP.SP);
    expect(codigos(c)).toEqual(['expresso-termico', 'retirada']);
    // 160 g + caixa 350 g + 2 gelos de 200 g = 910 g: preço até 1 kg, mais caixa e gelos
    expect(opcao(c, 'expresso-termico')).toMatchObject({ nome: 'Expresso com caixa térmica', preco: 54.8, gelos: 2, maxima: 31, despacho: '2026-11-03', entregaMax: '2026-11-05' });
    expect(c.ok && c.descartes).toEqual([{ servico: 'Econômico', motivo: 'leva até 6 dias úteis e sempre passaria um fim de semana parado no galpão' }]);
  });

  it('tablete amargo para Porto Alegre a 22 °C dispensa a caixa, mas não o cuidado com o fim de semana', () => {
    const c = pedir(carrinho('TAB-85', 'TAB-100'), CEP.RS);
    expect(opcao(c, 'expresso')).toMatchObject({ preco: 39.9, caixaTermica: false, maxima: 22, despacho: '2026-11-03', entregaMax: '2026-11-06' });
    expect(codigos(c)).not.toContain('economico');
  });

  it('pedido de quinta à tarde espera a segunda para não passar o fim de semana no galpão', () => {
    const c = pedir(carrinho('TAB-70'), CEP.SP, naBahia('2026-11-05', '15:00'));
    expect(opcao(c, 'expresso-termico')).toMatchObject({ despacho: '2026-11-09', esperaPeloDespacho: 3, entregaMin: '2026-11-10', entregaMax: '2026-11-11' });
  });

  it('calor extremo encurta o que a caixa segura', () => {
    // Cuiabá a 38 °C: expresso de 3 dias ainda cabe nos 3 dias do calor extremo
    expect(opcao(pedir(carrinho('BOMBOM-9'), CEP.MT), 'expresso-termico')).toMatchObject({ gelos: 3, maxima: 38 });
    // Manaus a 33 °C: 4 dias de viagem cabem nos 4 dias da caixa, saindo numa segunda
    expect(opcao(pedir(carrinho('BOMBOM-9'), CEP.AM), 'expresso-termico')).toMatchObject({ despacho: '2026-11-09', entregaMax: '2026-11-13', gelos: 4 });
    // Manaus a 36 °C: não cabe; sobra a retirada
    const c = pedir(carrinho('BOMBOM-9'), CEP.AM, TERCA_DE_MANHA, previsaoCom({ AM: 36 }));
    expect(codigos(c)).toEqual(['retirada']);
    expect(c.ok && c.descartes[0].motivo).toBe('36 °C previstos, e a caixa térmica segura 3 dias; a viagem leva até 4');
  });

  it('sem previsão, trata como o pior calor', () => {
    const c = pedir(carrinho('TAB-70'), CEP.BA, TERCA_DE_MANHA, null);
    expect(opcao(c, 'expresso-termico')).toMatchObject({ maxima: null, gelos: 1 });
    const velha = pedir(carrinho('TAB-70'), CEP.BA, TERCA_DE_MANHA, previsaoCom({ BA: 20 }, '2026-11-01T00:00:00Z'));
    expect(codigos(velha)).toContain('expresso-termico');
  });

  it('cobra o quilo a mais quando a caixa e os gelos passam do quilo', () => {
    // 12 tabletes (960 g) + caixa 350 g + 2 gelos (400 g) = 1.710 g: dois quilos
    const c = pedir(carrinho(['TAB-70', 12]), CEP.SP);
    expect(opcao(c, 'expresso-termico')?.preco).toBe(62.8);
  });

  it('recusa CEP inválido e carrinho vazio', () => {
    expect(pedir(carrinho('TAB-70'), '123')).toEqual({ ok: false, erro: 'CEP de destino inválido.' });
    expect(pedir([], CEP.SP)).toEqual({ ok: false, erro: 'Carrinho vazio.' });
  });
});
