export interface Vendedor {
  id: string;
  /** Código sequencial gerado pela API (`VEN-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da foto do vendedor ou null. */
  foto: string | null;
  /** Telefone único — usado também como WhatsApp. */
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  /**
   * Agregados de vendas calculados pela camada de dados (hoje mock, amanhã
   * NestJS). O frontend NUNCA recalcula isso somando vendas no componente.
   */
  vendas: number;
  totalVendido: number;
  /** Data ISO da venda mais recente ou null quando nunca vendeu. */
  ultimaVenda: string | null;
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
