// A configuração da Cabruca Chocolates (loja fictícia de Ilhéus, BA). Preços e prazos são de uma
// tabela de transportadora inventada para o projeto conceito.
import type { ConfigDaLoja, Zona } from '../dominio/cotacao.ts';
import type { UF } from '../dominio/cep.ts';

const zonas: Record<UF, Zona> = {
  BA: 'bahia',
  SE: 'nordeste', AL: 'nordeste', PE: 'nordeste', PB: 'nordeste', RN: 'nordeste', CE: 'nordeste', PI: 'nordeste', MA: 'nordeste',
  ES: 'sudeste', MG: 'sudeste', RJ: 'sudeste', SP: 'sudeste',
  DF: 'centro-sul', GO: 'centro-sul', MT: 'centro-sul', MS: 'centro-sul', TO: 'centro-sul', PR: 'centro-sul', SC: 'centro-sul', RS: 'centro-sul',
  PA: 'norte', AP: 'norte', AM: 'norte', RR: 'norte', AC: 'norte', RO: 'norte',
};

export const cabruca: ConfigDaLoja = {
  fuso: 'America/Bahia',
  corteDoDespacho: 11 * 60,
  zonas,
  servicos: [
    {
      codigo: 'expresso',
      nome: 'Expresso',
      prazos: { bahia: [1, 1], nordeste: [1, 2], sudeste: [1, 2], 'centro-sul': [2, 3], norte: [3, 4] },
      precos: {
        bahia: { ate1kg: 19.9, kgAdicional: 4 },
        nordeste: { ate1kg: 29.9, kgAdicional: 7 },
        sudeste: { ate1kg: 34.9, kgAdicional: 8 },
        'centro-sul': { ate1kg: 39.9, kgAdicional: 9 },
        norte: { ate1kg: 54.9, kgAdicional: 12 },
      },
    },
    {
      codigo: 'economico',
      nome: 'Econômico',
      prazos: { bahia: [2, 3], nordeste: [3, 5], sudeste: [4, 6], 'centro-sul': [5, 8], norte: [7, 11] },
      precos: {
        bahia: { ate1kg: 12.9, kgAdicional: 2 },
        nordeste: { ate1kg: 18.9, kgAdicional: 4 },
        sudeste: { ate1kg: 21.9, kgAdicional: 4 },
        'centro-sul': { ate1kg: 24.9, kgAdicional: 5 },
        norte: { ate1kg: 32.9, kgAdicional: 7 },
      },
    },
  ],
  retirada: {
    codigo: 'retirada',
    nome: 'Retirar na loja em Ilhéus',
    endereco: { rua: 'Rua do Cacau', numero: '120', bairro: 'Centro', cidade: 'Ilhéus', uf: 'BA', cep: '45653000', latitude: -14.79, longitude: -39.04 },
    horarios: [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: '0900', fecha: '1800' })).concat({ dia: 6, abre: '0900', fecha: '1300' }),
  },
  classes: {
    // Tabletes amargos amolecem; ao leite, recheados e drágeas derretem; cacau em pó, nibs e mel não.
    'TAB-70': 'amolece',
    'TAB-85': 'amolece',
    'TAB-100': 'amolece',
    'TAB-CRAVO': 'amolece',
    'KIT-DEG': 'amolece',
    'LASCAS-CAST': 'derrete',
    'DRAG-CAFE': 'derrete',
    'BOMBOM-9': 'derrete',
    'TRUFA-PIST': 'derrete',
    'NIBS': 'nao-derrete',
    'PO-50': 'nao-derrete',
    'MEL-CACAU': 'nao-derrete',
  },
  limites: { amolece: 29, derrete: 25 },
  caixa: { preco: 14.9, gramas: 350, diasQueSegura: 4, calorExtremo: 35, diasQueSeguraNoExtremo: 3 },
  gelo: { preco: 2.5, gramas: 200 },
};
