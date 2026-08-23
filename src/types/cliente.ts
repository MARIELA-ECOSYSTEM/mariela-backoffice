export interface Cliente {
  id: string;
  /** Código sequencial gerado pela API (`CLI-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da foto/avatar da cliente ou null. */
  foto: string | null;
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ClientePayload {
  nome: string;
  foto?: string | null | undefined;
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
  ativo: boolean;
}
