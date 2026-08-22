export interface Vendedor {
  id: string;
  nome: string;
  /** URL da foto do vendedor ou null. */
  foto: string | null;
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface VendedorPayload {
  nome: string;
  foto?: string | null | undefined;
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
  ativo: boolean;
  /** Senha em texto plano enviada à API, que gera o hash. Nunca é retornada. */
  senha?: string | undefined;
}

export interface VendedorStatusPayload {
  ativo: boolean;
}

export interface VendedorSenhaPayload {
  senha: string;
}
