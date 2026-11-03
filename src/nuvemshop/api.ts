// Cliente mínimo da API REST da Nuvemshop.
// https://tiendanube.github.io/api-documentation/intro
//   - base https://api.nuvemshop.com.br/2025-03/{store_id}
//   - token de acesso no cabeçalho Authorization: Bearer
//   - User-Agent com o nome do app e um contato, senão a API responde 400
//   - balde de 40 requisições que esvazia 2 por segundo; passou disso, 429

export const API_DA_NUVEMSHOP = 'https://api.nuvemshop.com.br/2025-03';

export class ErroDaNuvemshop extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

export interface ClienteDaNuvemshop {
  pedir<T = unknown>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T>;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

export function clienteDaNuvemshop({
  lojaId,
  token,
  userAgent,
  buscar = fetch,
  pausa = esperar,
}: {
  lojaId: string | number;
  token: string;
  userAgent: string;
  buscar?: typeof fetch;
  pausa?: (ms: number) => Promise<unknown>;
}): ClienteDaNuvemshop {
  return {
    async pedir(metodo, caminho, corpo) {
      for (let tentativa = 0; ; tentativa += 1) {
        const resposta = await buscar(`${API_DA_NUVEMSHOP}/${lojaId}${caminho}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent, 'Content-Type': 'application/json' },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        // Balde cheio: espera o balde esvaziar um pouco e tenta de novo, duas vezes no máximo.
        if (resposta.status === 429 && tentativa < 2) {
          await pausa(1000 * (tentativa + 1));
          continue;
        }
        const texto = await resposta.text();
        if (!resposta.ok) throw new ErroDaNuvemshop(resposta.status, `${metodo} ${caminho}: ${resposta.status} ${texto.slice(0, 300)}`);
        return (texto ? JSON.parse(texto) : null) as never;
      }
    },
  };
}
