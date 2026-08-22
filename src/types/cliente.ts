export interface Cliente {
  id: string;
  nome: string;
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
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
  ativo: boolean;
}
