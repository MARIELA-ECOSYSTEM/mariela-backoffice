import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { clonar, db, gerarId, recalcularProduto } from "./db";
import type { Produto } from "@/types/produto";
import type {
  EntradaEstoqueRequest,
  ResumoEstoqueProduto,
  SaidaEstoqueRequest,
} from "@/types/estoque";
import type { Variante } from "@/types/variante";

function encontrarProduto(id: string): Produto {
  const produto = db.produtos.find((p) => p.id === id);
  if (!produto) throw ApiError.notFound("Produto não encontrado.");
  return produto;
}

function encontrarVariante(produto: Produto, varianteId: string): Variante {
  const variante = produto.variantes.find((v) => v.id === varianteId);
  if (!variante) throw ApiError.notFound("Variante não encontrada.");
  return variante;
}

export function registerEstoqueMocks(): void {
  registerMock("GET", "/estoque", ({ query }) => {
    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    const disponibilidade = query["disponibilidade"];
    const lista: ResumoEstoqueProduto[] = db.produtos
      .filter((produto) => {
        if (busca && !`${produto.nome} ${produto.codProduto}`.toLowerCase().includes(busca))
          return false;
        if (disponibilidade === "disponivel" && produto.quantidadeTotal <= 0) return false;
        if (disponibilidade === "sem-estoque" && produto.quantidadeTotal > 0) return false;
        return true;
      })
      .map((produto) => ({
        produtoId: produto.id,
        codProduto: produto.codProduto,
        nome: produto.nome,
        categoria: produto.categoria,
        foto: produto.variantes[0]?.foto ?? null,
        quantidadeTotal: produto.quantidadeTotal,
        totalVariantes: produto.variantes.length,
        estoqueZeradoEm: produto.estoqueZeradoEm ?? null,
      }));
    return { data: lista, meta: { total: lista.length } };
  });

  registerMock("POST", "/estoque/entrada", ({ body }) => {
    const payload = (body ?? {}) as EntradaEstoqueRequest;
    if (!payload.quantidade || payload.quantidade <= 0) {
      throw ApiError.validation("Dados inválidos.", [
        { field: "quantidade", message: "Quantidade deve ser maior que zero." },
      ]);
    }
    const produto = encontrarProduto(payload.produtoId);
    const variante = encontrarVariante(produto, payload.varianteId);

    if (payload.tamanhoId) {
      const tamanho = variante.tamanhos.find((t) => t.id === payload.tamanhoId);
      if (!tamanho) throw ApiError.notFound("Tamanho não encontrado.");
      tamanho.quantidade += payload.quantidade;
    } else {
      const nome = payload.tamanho?.trim();
      if (!nome) {
        throw ApiError.validation("Dados inválidos.", [
          { field: "tamanho", message: "Tamanho é obrigatório." },
        ]);
      }
      const existente = variante.tamanhos.find(
        (t) => t.tamanho.toLowerCase() === nome.toLowerCase(),
      );
      if (existente) existente.quantidade += payload.quantidade;
      else
        variante.tamanhos.push({
          id: gerarId("tam"),
          tamanho: nome,
          quantidade: payload.quantidade,
        });
    }

    recalcularProduto(produto);
    return { data: clonar(produto) };
  });

  registerMock("POST", "/estoque/saida", ({ body }) => {
    const payload = (body ?? {}) as SaidaEstoqueRequest;
    const errors: ApiFieldError[] = [];
    if (!payload.quantidade || payload.quantidade <= 0)
      errors.push({ field: "quantidade", message: "Quantidade deve ser maior que zero." });
    if (!payload.motivo?.trim()) errors.push({ field: "motivo", message: "Motivo é obrigatório." });
    if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

    const produto = encontrarProduto(payload.produtoId);
    const variante = encontrarVariante(produto, payload.varianteId);
    const tamanho = variante.tamanhos.find((t) => t.id === payload.tamanhoId);
    if (!tamanho) throw ApiError.notFound("Tamanho não encontrado.");

    if (payload.quantidade > tamanho.quantidade) {
      throw ApiError.validation("Dados inválidos.", [
        {
          field: "quantidade",
          message: `Quantidade indisponível. Estoque atual do tamanho ${tamanho.tamanho}: ${tamanho.quantidade}.`,
        },
      ]);
    }

    tamanho.quantidade -= payload.quantidade;
    recalcularProduto(produto);
    return { data: clonar(produto) };
  });
}
