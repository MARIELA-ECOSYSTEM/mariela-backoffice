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
  codVariante: string;
  cor: string;
  foto?: string | null;
  video?: string | null;
}

export type AtualizarVarianteRequest = CriarVarianteRequest;

export interface AdicionarTamanhoRequest {
  tamanho: string;
  quantidade: number;
}
