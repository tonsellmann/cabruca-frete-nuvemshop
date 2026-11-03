// O que o app guarda: o token de cada loja instalada e a última previsão do tempo. Em produção é
// um namespace do Workers KV; nos testes, um Map.

export interface Armazem {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string): Promise<void>;
  delete(chave: string): Promise<void>;
}

export interface Loja {
  token: string;
  instaladaEm: string;
}

export const chaveDaLoja = (lojaId: string | number) => `loja:${lojaId}`;
export const CHAVE_DA_PREVISAO = 'previsao';

export async function lerJson<T>(armazem: Armazem, chave: string): Promise<T | null> {
  const texto = await armazem.get(chave);
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

export function armazemNaMemoria(inicial: Record<string, string> = {}): Armazem & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    async get(chave) {
      return dados.get(chave) ?? null;
    },
    async put(chave, valor) {
      dados.set(chave, valor);
    },
    async delete(chave) {
      dados.delete(chave);
    },
  };
}
