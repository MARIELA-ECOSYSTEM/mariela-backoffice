import type { EnderecoFornecedor, Fornecedor } from "@/types/fornecedor";

/**
 * Regras de apresentação e ordenação de fornecedores.
 * Mantidas fora dos componentes (padrão de arquitetura do backoffice).
 */

export function temEndereco(fornecedor: Fornecedor): boolean {
  const endereco = fornecedor.endereco;
  if (!endereco) return false;
  return Object.values(endereco).some((valor) => valor.trim().length > 0);
}

/** "São Paulo/SP" — vazio quando não há cidade cadastrada. */
export function cidadeUf(endereco: EnderecoFornecedor | null): string {
  if (!endereco) return "";
  const cidade = endereco.cidade.trim();
  const estado = endereco.estado.trim().toUpperCase();
  if (!cidade && !estado) return "";
  return [cidade, estado].filter(Boolean).join("/");
}

/** Endereço completo em uma linha (usado na ficha do fornecedor). */
export function enderecoCompleto(endereco: EnderecoFornecedor | null): string {
  if (!endereco) return "";
  const linha = [
    [endereco.logradouro, endereco.numero].filter((parte) => parte.trim()).join(", "),
    endereco.complemento,
    endereco.bairro,
    cidadeUf(endereco),
    endereco.cep,
  ]
    .map((parte) => parte.trim())
    .filter(Boolean);
  return linha.join(" · ");
}

export const ENDERECO_VAZIO: EnderecoFornecedor = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

/** Faixas de produtos vinculados usadas pelas facetas. */
export type FaixaProdutos = "sem" | "1-5" | "6-15" | "16+";

export const OPCOES_FAIXA_PRODUTOS: { valor: FaixaProdutos; label: string }[] = [
  { valor: "sem", label: "Sem produtos" },
  { valor: "1-5", label: "1 a 5 produtos" },
  { valor: "6-15", label: "6 a 15 produtos" },
  { valor: "16+", label: "16 ou mais" },
];

export function naFaixaDeProdutos(quantidade: number, faixa: string): boolean {
  switch (faixa) {
    case "sem":
      return quantidade === 0;
    case "1-5":
      return quantidade >= 1 && quantidade <= 5;
    case "6-15":
      return quantidade >= 6 && quantidade <= 15;
    case "16+":
      return quantidade >= 16;
    default:
      return true;
  }
}

/** Última entrada dentro de uma janela de dias (facetas de recência). */
export function ultimaEntradaDentroDe(fornecedor: Fornecedor, dias: number): boolean {
  if (!fornecedor.ultimaEntrada) return false;
  const limite = Date.now() - dias * 86_400_000;
  return new Date(fornecedor.ultimaEntrada).getTime() >= limite;
}

export type OrdenacaoFornecedor =
  | "nome-asc"
  | "nome-desc"
  | "produtos-desc"
  | "custo-desc"
  | "entrada-recente"
  | "parceiro-antigo";

export const OPCOES_ORDENACAO_FORNECEDOR: { valor: OrdenacaoFornecedor; label: string }[] = [
  { valor: "nome-asc", label: "Nome: A → Z" },
  { valor: "nome-desc", label: "Nome: Z → A" },
  { valor: "produtos-desc", label: "Mais produtos vinculados" },
  { valor: "custo-desc", label: "Maior valor em custo" },
  { valor: "entrada-recente", label: "Última entrada" },
  { valor: "parceiro-antigo", label: "Parceiros mais antigos" },
];

function tempo(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

export function ordenarFornecedores(
  lista: Fornecedor[],
  ordem: OrdenacaoFornecedor,
): Fornecedor[] {
  const copia = [...lista];
  const porNome = (a: Fornecedor, b: Fornecedor) => a.nome.localeCompare(b.nome, "pt-BR");
  switch (ordem) {
    case "nome-desc":
      return copia.sort((a, b) => porNome(b, a));
    case "produtos-desc":
      return copia.sort((a, b) => b.produtosVinculados - a.produtosVinculados || porNome(a, b));
    case "custo-desc":
      return copia.sort((a, b) => b.valorEmCusto - a.valorEmCusto || porNome(a, b));
    case "entrada-recente":
      return copia.sort((a, b) => tempo(b.ultimaEntrada) - tempo(a.ultimaEntrada) || porNome(a, b));
    case "parceiro-antigo":
      return copia.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || porNome(a, b));
    case "nome-asc":
    default:
      return copia.sort(porNome);
  }
}
