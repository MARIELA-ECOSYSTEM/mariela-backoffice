export interface Cliente {
  id: string;
  /** Código sequencial gerado pela API (`CLI-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da foto/avatar da cliente ou null. */
  foto: string | null;
  /** Telefone único do cliente — usado também como número de WhatsApp. */
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  criadoEm: string;
  atualizadoEm: string;
  /**
   * Agregados de compras calculados pelo backend (hoje pelo mock).
   * O frontend NUNCA deve recalcular isso somando vendas no componente.
   */
  compras: number;
  totalComprado: number;
  /** Data ISO da venda mais recente ou null quando nunca comprou. */
  ultimaCompra: string | null;
}

export interface ClientePayload {
  nome: string;
  foto?: string | null | undefined;
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
}
