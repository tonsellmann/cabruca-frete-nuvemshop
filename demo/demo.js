// A demonstração: a etapa de frete do checkout, com o mesmo código que o app roda no Worker.
// app/ é gerado de src/ por scripts/preparar-demonstracao.mjs (os tipos do TypeScript saem).
import { cotar } from './app/dominio/cotacao.js';
import { cabruca } from './app/config/loja.js';
import { tarifaDe } from './app/nuvemshop/frete.js';
import { lerReferencia, notaDaExpedicao, referenciaDe } from './app/dominio/expedicao.js';
import { CAPITAIS } from './app/dominio/clima.js';
import { lerPrevisao, urlDaPrevisao } from './app/clima/previsao.js';
import { agoraNoFuso, diaUtil, somarDias } from './app/dominio/calendario.js';
import { ufDoCep } from './app/dominio/cep.js';

const PRODUTOS = [
  { sku: 'TRUFA-PIST', nome: 'Trufas de pistache', preco: 42.9, gramas: 160, foto: 'trufa' },
  { sku: 'BOMBOM-9', nome: 'Caixa de 9 bombons', preco: 54.9, gramas: 140, foto: 'bombom' },
  { sku: 'LASCAS-CAST', nome: 'Lascas com castanha', preco: 36.9, gramas: 150, foto: 'lascas' },
  { sku: 'TAB-70', nome: '70% Cabruca', preco: 29.9, gramas: 80, foto: 't70' },
  { sku: 'TAB-85', nome: '85% Intenso', preco: 32.9, gramas: 80, foto: 't85' },
  { sku: 'KIT-DEG', nome: 'Kit degustação', preco: 99.9, gramas: 450, foto: 'kit' },
  { sku: 'NIBS', nome: 'Nibs de cacau', preco: 24.9, gramas: 150, foto: 'nibs' },
  { sku: 'PO-50', nome: 'Chocolate em pó 50%', preco: 26.9, gramas: 200, foto: 'po' },
];
const FOTOS = '/fotos/cabruca-chocolates/';

const DESTINOS = [
  { nome: 'São Paulo', cep: '01310-100' },
  { nome: 'Cuiabá', cep: '78005-000' },
  { nome: 'Porto Alegre', cep: '90010-000' },
  { nome: 'Manaus', cep: '69005-000' },
  { nome: 'Salvador', cep: '40010-000' },
];

const ROTULO_DA_CLASSE = {
  derrete: `derrete acima de ${cabruca.limites.derrete} °C`,
  amolece: `amolece acima de ${cabruca.limites.amolece} °C`,
  'nao-derrete': 'não derrete',
};

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const semana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const curto = (dia) => `${SEMANA[semana(dia)]}, ${dia.slice(8)}/${dia.slice(5, 7)}`;
const reais = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const $ = (s) => document.querySelector(s);
const el = (tag, atributos = {}, ...filhos) => {
  const no = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v == null || v === false) continue;
    if (k === 'class') no.className = v;
    else if (k === 'text') no.textContent = v;
    else no.setAttribute(k, v === true ? '' : v);
  }
  no.append(...filhos.filter((f) => f != null && f !== false));
  return no;
};

const estado = {
  quantidades: { 'TRUFA-PIST': 1, 'TAB-70': 2 },
  cep: DESTINOS[0].cep,
  momento: 'agora',
  calor: false,
  previsao: null,
  origem: '',
  escolhida: null,
};

/** "Agora" e dois momentos da semana em que o despacho muda: quinta à tarde e sexta de manhã. */
function momentos() {
  const hoje = agoraNoFuso(new Date(), cabruca.fuso).dia;
  const proxima = (alvo) => {
    let d = somarDias(hoje, 1);
    while (semana(d) !== alvo) d = somarDias(d, 1);
    return d;
  };
  const quinta = proxima(4);
  const sexta = proxima(5);
  return [
    { id: 'agora', rotulo: 'Agora', data: new Date() },
    { id: 'quinta', rotulo: `Quinta, ${quinta.slice(8)}/${quinta.slice(5, 7)}, 15h`, data: new Date(`${quinta}T15:00:00-03:00`) },
    { id: 'sexta', rotulo: `Sexta, ${sexta.slice(8)}/${sexta.slice(5, 7)}, 10h`, data: new Date(`${sexta}T10:00:00-03:00`) },
  ];
}

function itens() {
  return PRODUTOS.filter((p) => estado.quantidades[p.sku] > 0).map((p) => ({ sku: p.sku, quantidade: estado.quantidades[p.sku], gramas: p.gramas }));
}

/** A previsão do jeito que o Worker teria guardado: fresca em relação ao momento simulado. */
function previsaoParaO(momento) {
  if (!estado.previsao) return null;
  const maximas = {};
  for (const [uf, dias] of Object.entries(estado.previsao.maximas)) {
    maximas[uf] = Object.fromEntries(Object.entries(dias).map(([d, t]) => [d, estado.calor ? t + 5 : t]));
  }
  return { atualizadaEm: momento.toISOString(), maximas };
}

function desenharProdutos() {
  $('[data-produtos]').replaceChildren(
    ...PRODUTOS.map((p) => {
      const classe = cabruca.classes[p.sku];
      const qtd = estado.quantidades[p.sku] ?? 0;
      return el('li', { class: `produto${qtd ? ' produto--no-carrinho' : ''}` },
        el('img', { src: `${FOTOS}${p.foto}.webp`, alt: '', width: 56, height: 56, loading: 'lazy' }),
        el('div', { class: 'produto__texto' },
          el('strong', { text: p.nome }),
          el('span', { class: `classe classe--${classe}`, text: ROTULO_DA_CLASSE[classe] })),
        el('div', { class: 'quantidade' },
          el('button', { type: 'button', 'data-sku': p.sku, 'data-passo': '-1', 'aria-label': `Um ${p.nome} a menos`, disabled: qtd === 0, text: '−' }),
          el('output', { 'aria-label': `Quantidade de ${p.nome}`, text: String(qtd) }),
          el('button', { type: 'button', 'data-sku': p.sku, 'data-passo': '1', 'aria-label': `Um ${p.nome} a mais`, text: '+' })));
    }),
  );
}

function desenharControles() {
  $('[data-atalhos]').replaceChildren(
    ...DESTINOS.map((d) => el('button', { type: 'button', class: 'atalho', 'data-cep': d.cep, 'aria-pressed': String(d.cep === estado.cep), text: d.nome })),
  );
  $('[data-momentos]').replaceChildren(
    ...momentos().map((m) => el('button', { type: 'button', role: 'radio', class: 'momento', 'data-momento': m.id, 'aria-checked': String(m.id === estado.momento), text: m.rotulo })),
  );
}

function recalcular() {
  const momento = momentos().find((m) => m.id === estado.momento).data;
  const cotacao = cotar({ itens: itens(), cep: estado.cep, agora: momento, config: cabruca, previsao: previsaoParaO(momento) });
  desenharControles();
  $('[data-origem]').textContent = estado.origem;

  if (!cotacao.ok) {
    $('[data-opcoes]').replaceChildren(el('p', { class: 'aviso', text: cotacao.erro === 'Carrinho vazio.' ? 'Ponha algum produto no pedido.' : 'Digite um CEP com 8 dígitos.' }));
    for (const s of ['[data-termometro]', '[data-descartes]', '[data-nota]']) $(s).replaceChildren();
    $('[data-json]').textContent = JSON.stringify({ error: cotacao.erro }, null, 2);
    return;
  }

  if (!cotacao.opcoes.some((o) => o.codigo === estado.escolhida)) estado.escolhida = cotacao.opcoes[0]?.codigo ?? null;
  const escolhida = cotacao.opcoes.find((o) => o.codigo === estado.escolhida);

  $('[data-opcoes]').replaceChildren(
    el('p', { class: 'destino', text: `Destino em ${cotacao.uf}. O item mais sensível do pedido ${ROTULO_DA_CLASSE[cotacao.classe]}.` }),
    el('div', { class: 'opcoes', role: 'radiogroup', 'aria-label': 'Opções de entrega' },
      ...cotacao.opcoes.map((o) => {
        const detalhes = [];
        if (o.tipo === 'pickup') detalhes.push('Rua do Cacau, 120, Ilhéus');
        else detalhes.push(`sai ${curto(o.despacho)}`);
        if (o.caixaTermica) detalhes.push(`caixa térmica e ${o.gelos} ${o.gelos === 1 ? 'gelo' : 'gelos'}`);
        if (o.esperaPeloDespacho > 0) detalhes.push('não sai antes para não parar em fim de semana ou feriado');
        return el('button', { type: 'button', role: 'radio', class: `opcao${o.caixaTermica ? ' opcao--termica' : ''}`, 'data-opcao': o.codigo, 'aria-checked': String(o.codigo === estado.escolhida) },
          el('span', { class: 'opcao__nome', text: o.nome }),
          el('span', { class: 'opcao__preco', text: o.preco ? reais(o.preco) : 'Grátis' }),
          el('span', { class: 'opcao__prazo', text: o.tipo === 'pickup' ? `pronto a partir de ${curto(o.entregaMin)}` : `chega entre ${curto(o.entregaMin)} e ${curto(o.entregaMax)}` }),
          el('span', { class: 'opcao__detalhe', text: detalhes.join(' · ') }));
      })),
  );

  desenharTermometro(cotacao, escolhida, momento);

  $('[data-descartes]').replaceChildren(
    ...(cotacao.descartes.length
      ? [el('div', { class: 'descartes' },
          el('h3', { text: 'Fora da lista para este pedido' }),
          el('ul', {}, ...cotacao.descartes.map((d) => el('li', {}, el('strong', { text: d.servico }), `: ${d.motivo}.`))))]
      : []),
  );

  $('[data-json]').textContent = JSON.stringify({ rates: cotacao.opcoes.map((o) => tarifaDe(o, cabruca)) }, null, 2);

  if (escolhida) {
    $('[data-nota]').replaceChildren(
      el('h3', { text: 'Quando o pedido for pago, a nota interna diz' }),
      el('p', { text: notaDaExpedicao(lerReferencia(referenciaDe(escolhida))) }),
    );
  }
}

/** As máximas dos próximos dias na capital do destino, com a viagem da opção escolhida marcada. */
function desenharTermometro(cotacao, opcao, momento) {
  const alvo = $('[data-termometro]');
  const previsao = previsaoParaO(momento);
  const dias = previsao?.maximas[cotacao.uf];
  if (!dias || !opcao || opcao.tipo === 'pickup') {
    alvo.replaceChildren();
    return;
  }
  const inicio = agoraNoFuso(momento, cabruca.fuso).dia;
  const limite = cotacao.classe === 'nao-derrete' ? null : cabruca.limites[cotacao.classe];
  const colunas = [];
  for (let i = 0; i < 10; i += 1) {
    const dia = somarDias(inicio, i);
    const t = dias[dia];
    const naViagem = dia >= opcao.despacho && dia <= opcao.entregaMax;
    const quente = limite !== null && typeof t === 'number' && t > limite;
    colunas.push(el('li', { class: [naViagem && 'na-viagem', quente && 'quente', !diaUtil(dia) && 'parado'].filter(Boolean).join(' ') },
      el('span', { class: 'barra', style: `--t:${typeof t === 'number' ? Math.max(0, Math.min(1, (t - 15) / 25)) : 0}` }),
      el('span', { class: 'graus', text: typeof t === 'number' ? `${Math.round(t)}°` : '–' }),
      el('span', { class: 'dia', text: SEMANA[semana(dia)] })));
  }
  alvo.replaceChildren(
    el('h3', { text: `Máximas previstas em ${CAPITAIS[cotacao.uf].cidade}` }),
    el('ol', { class: 'dias' }, ...colunas),
    el('p', { class: 'legenda' },
      el('span', { class: 'chave chave--viagem' }), 'dias da viagem ',
      el('span', { class: 'chave chave--parado' }), 'sem transporte ',
      limite !== null ? el('span', { class: 'chave chave--quente' }) : null, limite !== null ? `acima de ${limite} °C` : null),
  );
}

async function carregarPrevisao() {
  try {
    const resposta = await fetch(urlDaPrevisao());
    if (!resposta.ok) throw new Error(String(resposta.status));
    estado.previsao = lerPrevisao(await resposta.json(), new Date());
    const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: cabruca.fuso }).format(new Date());
    estado.origem = `Previsão do Open-Meteo buscada hoje às ${hora}, para as 27 capitais.`;
  } catch {
    estado.previsao = await (await fetch('previsao-exemplo.json')).json();
    const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: cabruca.fuso }).format(new Date(estado.previsao.atualizadaEm));
    estado.origem = `Sem conexão com o Open-Meteo: usando a previsão guardada em ${dia}.`;
  }
}

document.addEventListener('click', (e) => {
  const passo = e.target.closest('[data-passo]');
  if (passo) {
    const sku = passo.dataset.sku;
    estado.quantidades[sku] = Math.max(0, (estado.quantidades[sku] ?? 0) + Number(passo.dataset.passo));
    desenharProdutos();
    recalcular();
    return;
  }
  const atalho = e.target.closest('[data-cep]');
  if (atalho && atalho.tagName === 'BUTTON') {
    estado.cep = atalho.dataset.cep;
    $('input[data-cep]').value = estado.cep;
    recalcular();
    return;
  }
  const momento = e.target.closest('[data-momento]');
  if (momento) {
    estado.momento = momento.dataset.momento;
    recalcular();
    return;
  }
  const opcao = e.target.closest('[data-opcao]');
  if (opcao) {
    estado.escolhida = opcao.dataset.opcao;
    recalcular();
  }
});

$('input[data-cep]').addEventListener('input', (e) => {
  const digitos = e.target.value.replace(/\D/g, '').slice(0, 8);
  e.target.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
  estado.cep = e.target.value;
  if (digitos.length === 8 || ufDoCep(estado.cep) === null) recalcular();
});
$('[data-calor]').addEventListener('change', (e) => {
  estado.calor = e.target.checked;
  recalcular();
});

$('input[data-cep]').value = estado.cep;
desenharProdutos();
await carregarPrevisao();
recalcular();
document.documentElement.classList.add('pronto');
