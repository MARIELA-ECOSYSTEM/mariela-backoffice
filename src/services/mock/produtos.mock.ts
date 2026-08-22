import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { agora, calcularMargem, clonar, db, gerarId, precoFinal, recalcularProduto } from "./db";
import type { Produto, ProdutoPayload, PromocaoRequest } from "@/types/produto";

function encontrarProduto(id: string): Produto {
  const produto = db.produtos.find((p) => p.id === id);
  if (!produto) throw ApiError.notFound("Produto não encontrado.");
  return produto;
}

function validarPayload(payload: Partial<ProdutoPayload>, idAtual?: string): void {
  const errors: ApiFieldError[] = [];
  if (!payload.codProduto?.trim()) errors.push({ field: "codProduto", message: "Código é obrigatório." });
  if (!payload.nome?.trim()) errors.push({ field: "nome", message: "Nome é obrigatório." });
  if (!payload.categoria?.trim()) errors.push({ field: "categoria", message: "Categoria é obrigatória." });
  if (!payload.precoCusto || payload.precoCusto <= 0)
    errors.push({ field: "precoCusto", message: "Preço de custo deve ser maior que zero." });
  if (!payload.precoVenda || payload.precoVenda <= 0)
    errors.push({ field: "precoVenda", message: "Preço de venda deve ser maior que zero." });

  const duplicado = db.produtos.find(
    (p) => p.codProduto.toLowerCase() === payload.codProduto?.trim().toLowerCase() && p.id !== idAtual,
  );
  if (duplicado) errors.push({ field: "codProduto", message: "Já existe um produto com este código." });

  if (errors.length) throw ApiError.validation("Dados inválidos.", errors);
}

function ordenar(lista: Produto[], campo: string, ordem: string): Produto[] {
  const fator = ordem === "desc" ? -1 : 1;
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "codProduto":
        return a.codProduto.localeCompare(b.codProduto) * fator;
      case "precoVenda":
        return (precoFinal(a) - precoFinal(b)) * fator;
      case "quantidadeTotal":
        return (a.quantidadeTotal - b.quantidadeTotal) * fator;
      case "criadoEm":
        return (new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()) * fator;
      default:
        return a.nome.localeCompare(b.nome) * fator;
    }
  });
}

export function registerProdutosMocks(): void {
  registerMock("GET", "/produtos", ({ query }) => {
    const busca = String(query["busca"] ?? "").trim().toLowerCase();
    let lista = db.produtos.filter((produto) => {
      if (busca && !`${produto.nome} ${produto.codProduto}`.toLowerCase().includes(busca)) return false;
      if (query["categoria"] && produto.categoria !== query["categoria"]) return false;
      if (query["colecaoId"] && produto.colecaoId !== query["colecaoId"]) return false;
      if (query["campanhaId"] && produto.campanhaId !== query["campanhaId"]) return false;
      if (query["fornecedorId"] && produto.fornecedorId !== query["fornecedorId"]) return false;
      const disponibilidade = query["disponibilidade"];
      if (disponibilidade === "disponivel" && produto.quantidadeTotal <= 0) return false;
      if (disponibilidade === "sem-estoque" && produto.quantidadeTotal > 0) return false;
      const promocao = query["promocao"];
      if (promocao === "sim" && !produto.ehPromocao) return false;
      if (promocao === "nao" && produto.ehPromocao) return false;
      const novidade = query["novidade"];
      if (novidade === "sim" && !produto.ehNovidade) return false;
      if (novidade === "nao" && produto.ehNovidade) return false;
      return true;
    });

    lista = ordenar(lista, String(query["ordenarPor"] ?? "nome"), String(query["ordem"] ?? "asc"));

    return { data: clonar(lista), meta: { total: lista.length, page: 1, limit: lista.length } };
  });

  registerMock("GET", "/produtos/:id", ({ params }) => ({
    data: clonar(encontrarProduto(params["id"]!)),
  }));

  registerMock("POST", "/produtos", ({ body }) => {
    const payload = (body ?? {}) as ProdutoPayload;
    validarPayload(payload);
    const produto: Produto = {
      id: gerarId("prd"),
      codProduto: payload.codProduto.trim(),
      nome: payload.nome.trim(),
      descricao: payload.descricao?.trim() ?? "",
      categoria: payload.categoria,
      colecaoId: payload.colecaoId ?? null,
      campanhaId: payload.campanhaId ?? null,
      fornecedorId: payload.fornecedorId ?? null,
      precoCusto: payload.precoCusto,
      margemLucro: calcularMargem(payload.precoCusto, payload.precoVenda),
      precoVenda: payload.precoVenda,
      ehNovidade: payload.ehNovidade ?? false,
      ehPromocao: false,
      precoPromocional: null,
      quantidadeTotal: 0,
      estoqueZeradoEm: agora(),
      variantes: [],
      criadoEm: agora(),
      atualizadoEm: agora(),
    };
    db.produtos.unshift(produto);
    return { data: clonar(produto) };
  });

  registerMock("PUT", "/produtos/:id", ({ params, body }) => {
    const produto = encontrarProduto(params["id"]!);
    const payload = (body ?? {}) as ProdutoPayload;
    validarPayload(payload, produto.id);
    produto.codProduto = payload.codProduto.trim();
    produto.nome = payload.nome.trim();
    produto.descricao = payload.descricao?.trim() ?? "";
    produto.categoria = payload.categoria;
    produto.colecaoId = payload.colecaoId ?? null;
    produto.campanhaId = payload.campanhaId ?? null;
    produto.fornecedorId = payload.fornecedorId ?? null;
    produto.precoCusto = payload.precoCusto;
    produto.precoVenda = payload.precoVenda;
    produto.ehNovidade = payload.ehNovidade ?? false;
    recalcularProduto(produto);
    return { data: clonar(produto) };
  });

  registerMock("DELETE", "/produtos/:id", ({ params }) => {
    const index = db.produtos.findIndex((p) => p.id === params["id"]);
    if (index < 0) throw ApiError.notFound("Produto não encontrado.");
    db.produtos.splice(index, 1);
    return { data: { id: params["id"]! } };
  });

  registerMock("PATCH", "/produtos/:id/promocao", ({ params, body }) => {
    const produto = encontrarProduto(params["id"]!);
    const payload = (body ?? {}) as PromocaoRequest;
    if (payload.ehPromocao) {
      const preco = payload.precoPromocional ?? 0;
      if (preco <= 0)
        throw ApiError.validation("Dados inválidos.", [
          { field: "precoPromocional", message: "Preço promocional deve ser maior que zero." },
        ]);
      if (preco >= produto.precoVenda)
        throw ApiError.validation("Dados inválidos.", [
          { field: "precoPromocional", message: "Preço promocional deve ser menor que o preço de venda." },
        ]);
      produto.ehPromocao = true;
      produto.precoPromocional = preco;
    } else {
      produto.ehPromocao = false;
    }
    recalcularProduto(produto);
    return { data: clonar(produto) };
  });
}
