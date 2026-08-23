export interface TamanhoVariante {
  id: string;
  tamanho: string;
  quantidade: number;
}

export interface Variante {
  id: string;
  codVariante: string;
  cor: string;
  quantidadeVariante: number;
  foto: string | null;
  video: string | null;
  tamanhos: TamanhoVariante[];
}

export interface CriarVarianteRequest {
  /**
   * Código gerado pelo backend (`PROD-0001-AZUL`). Não é enviado pelo cliente;
   * fica aqui apenas para compatibilidade de leitura da resposta.
   */
  codVariante?: string | undefined;
  cor: string;
  foto?: string | null;
  video?: string | null;
}

export type AtualizarVarianteRequest = CriarVarianteRequest;

export interface AdicionarTamanhoRequest {
  tamanho: string;
  quantidade: number;
}
