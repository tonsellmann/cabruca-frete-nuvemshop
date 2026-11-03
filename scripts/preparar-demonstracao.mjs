// Gera a demonstração: a página de demo/ e, em app/, o código do app que roda no navegador (o
// domínio, a configuração da loja, o formato das tarifas e a leitura da previsão), com os tipos
// do TypeScript retirados pelo próprio Node.
//
//   node scripts/preparar-demonstracao.mjs ../Portfolio/public/demos/cabruca-frete
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: node scripts/preparar-demonstracao.mjs <pasta de destino>');
  process.exit(1);
}
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const pasta = resolve(destino);

const MODULOS = [
  'dominio/calendario.ts',
  'dominio/cep.ts',
  'dominio/clima.ts',
  'dominio/cotacao.ts',
  'dominio/expedicao.ts',
  'config/loja.ts',
  'nuvemshop/frete.ts',
  'clima/previsao.ts',
];

await rm(pasta, { recursive: true, force: true });
for (const modulo of MODULOS) {
  const codigo = await readFile(join(RAIZ, 'src', modulo), 'utf8');
  const js = stripTypeScriptTypes(codigo, { mode: 'strip' }).replace(/(from\s+'[^']+)\.ts'/g, "$1.js'");
  const saida = join(pasta, 'app', modulo.replace(/\.ts$/, '.js'));
  await mkdir(dirname(saida), { recursive: true });
  await writeFile(saida, js);
}
for (const arquivo of ['index.html', 'demo.css', 'demo.js', 'previsao-exemplo.json']) {
  await cp(join(RAIZ, 'demo', arquivo), join(pasta, arquivo));
}
console.log(`Demonstração em ${pasta}`);
