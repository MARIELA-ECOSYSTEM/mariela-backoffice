export interface Fornecedor {
  id: string;
  /** Código sequencial gerado pela API (`FOR-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da logo/foto do fornecedor ou null. */
  foto: string | null;
  contato: string;
  telefone: string;
  email: string;
  cnpj: string;
  instagram: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface FornecedorPayload {
  nome: string;
  foto?: string | null | undefined;
  contato: string;
  telefone: string;
  email?: string | undefined;
  cnpj?: string | undefined;
  instagram?: string | undefined;
  ativo: boolean;
}

export interface StatusPayload {
  ativo: boolean;
}
