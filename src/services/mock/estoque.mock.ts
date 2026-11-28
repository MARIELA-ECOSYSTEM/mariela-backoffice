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

/**
 * Fase 2 — espelho de `EstoqueService.registrarManual` do backend: mesma `idempotencyKey` + mesma movimentação →
 * replay (devolve o produto como está, sem movimentar de novo); mesma chave + movimentação diferente → 409.
 */
const movimentacoesPorChave = new Map<string, string>();

function replayDaChave(
  idempotencyKey: string | undefined,
  assinatura: string,
  produtoId: string,
): { data: Produto } | null {
  const chave = idempotencyKey?.trim();
  if (!chave) return null;
  const anterior = movimentacoesPorChave.get(chave);
  if (anterior === undefined) return null;
  if (anterior !== assinatura) {
    throw ApiError.conflict(
      "Esta idempotencyKey já foi usada para uma movimentação de estoque diferente. Gere uma nova chave para esta operação.",
    );
  }
  return { data: clonar(encontrarProduto(produtoId)) };
}

function lembrarChave(idempotencyKey: string | undefined, assinatura: string): void {
  const chave = idempotencyKey?.trim();
  if (chave) movimentacoesPorChave.set(chave, assinatura);
}

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
        fotos: produto.variantes
          .map((variante) => variante.foto)
          .filter((foto): foto is string => Boolean(foto)),
        cores: produto.variantes.map((variante) => ({
          varianteId: variante.id,
          cor: variante.cor,
          quantidade: variante.quantidadeVariante,
          tamanhos: variante.tamanhos.map((tamanho) => ({
            id: tamanho.id,
            tamanho: tamanho.tamanho,
            quantidade: tamanho.quantidade,
          })),
        })),
        colecaoId: produto.colecaoId ?? null,
        campanhaId: produto.campanhaId ?? null,
        quantidadeTotal: produto.quantidadeTotal,
        totalVariantes: produto.variantes.length,
        estoqueZeradoEm: produto.estoqueZeradoEm ?? null,
      }));
    return { data: lista, meta: { total: lista.length } };
  });

  registerMock("POST", "/estoque/entrada", ({ body }) => {
    const payload = (body ?? {}) as EntradaEstoqueRequest;
    const assinatura = JSON.stringify([
      "entrada",
      payload.produtoId,
      payload.varianteId,
      payload.tamanhoId ?? payload.tamanho ?? null,
      payload.quantidade,
    ]);
    const replay = replayDaChave(payload.idempotencyKey, assinatura, payload.produtoId);
    if (replay) return replay;
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
    lembrarChave(payload.idempotencyKey, assinatura);
    return { data: clonar(produto) };
  });

  registerMock("POST", "/estoque/saida", ({ body }) => {
    const payload = (body ?? {}) as SaidaEstoqueRequest;
    const assinatura = JSON.stringify([
      "saida",
      payload.produtoId,
      payload.varianteId,
      payload.tamanhoId,
      payload.quantidade,
    ]);
    const replay = replayDaChave(payload.idempotencyKey, assinatura, payload.produtoId);
    if (replay) return replay;
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
    lembrarChave(payload.idempotencyKey, assinatura);
    return { data: clonar(produto) };
  });
}
