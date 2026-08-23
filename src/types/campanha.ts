export interface Campanha {
  id: string;
  /** Código sequencial gerado pela API (`CAM-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  descricao: string;
  /** Início da campanha em ISO (YYYY-MM-DD). */
  inicio: string;
  /** Fim da campanha em ISO (YYYY-MM-DD). */
  fim: string;
  ativo: boolean;
  criadoEm: string;
}

export interface CampanhaPayload {
  nome: string;
  descricao?: string | undefined;
  inicio: string;
  fim: string;
  ativo: boolean;
}
