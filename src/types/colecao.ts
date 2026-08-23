export interface Colecao {
  id: string;
  /** Código sequencial gerado pela API (`COL-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  descricao: string;
  /** Início da coleção em ISO (YYYY-MM-DD). */
  inicio: string;
  /** Fim da coleção em ISO (YYYY-MM-DD). */
  fim: string;
  ativo: boolean;
  /** Marcada para aparecer em áreas de destaque (futuro Mariela Vitrine Virtual). */
  destaque: boolean;
  /** Marcada para aparecer em banners/hero sections da vitrine. */
  banner: boolean;
  /** Imagem editorial usada em cards e destaques. */
  fotoDestaque: string | null;
  /** Imagem horizontal usada em banners/hero. */
  fotoBanner: string | null;
  criadoEm: string;
}

export interface ColecaoPayload {
  nome: string;
  descricao?: string | undefined;
  inicio: string;
  fim: string;
  ativo: boolean;
  destaque?: boolean | undefined;
  banner?: boolean | undefined;
  fotoDestaque?: string | undefined;
  fotoBanner?: string | undefined;
}
