export interface Colecao {
  id: string;
  nome: string;
  descricao: string;
  /** Início da coleção em ISO (YYYY-MM-DD). */
  inicio: string;
  /** Fim da coleção em ISO (YYYY-MM-DD). */
  fim: string;
  ativo: boolean;
  criadoEm: string;
}

export interface ColecaoPayload {
  nome: string;
  descricao?: string | undefined;
  inicio: string;
  fim: string;
  ativo: boolean;
}
