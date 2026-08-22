import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { clonar, db, gerarId, recalcularProduto } from "./db";
import type { Produto } from "@/types/produto";
import { conflitoTamanhoUnico, normalizarTamanho, tamanhosDaVariante } from "@/utils/tamanho";
import type { AdicionarTamanhoRequest, CriarVarianteRequest, Variante } from "@/types/variante";

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

function validarVariante(
  produto: Produto,
  payload: Partial<CriarVarianteRequest>,
  idAtual?: string,
): void {
  const errors: ApiFieldError[] = [];
  if (!payload.codVariante?.trim())
    errors.push({ field: "codVariante", message: "Código da variante é obrigatório." });
  if (!payload.cor?.trim()) errors.push({ field: "cor", message: "Cor é obrigatória." });
  if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

  const corDuplicada = produto.variantes.some(
    (v) => v.cor.toLowerCase() === payload.cor!.trim().toLowerCase() && v.id !== idAtual,
  );
  if (corDuplicada) {
    throw ApiError.validation("Dados inválidos.", [
      { field: "cor", message: "Esta cor já está cadastrada neste produto." },
    ]);
  }
}

/** Aplica a regra do tamanho único (U) dentro da variante. */
function validarRegraTamanhoUnico(variante: Variante, tamanho: string): void {
  const conflito = conflitoTamanhoUnico(tamanhosDaVariante(variante), tamanho);
  if (conflito)
    throw ApiError.validation("Dados inválidos.", [{ field: "tamanho", message: conflito }]);
}

export function registerVariantesMocks(): void {
  registerMock("GET", "/produtos/:id/variantes", ({ params }) => ({
    data: clonar(encontrarProduto(params["id"]!).variantes),
  }));

  registerMock("POST", "/produtos/:id/variantes", ({ params, body }) => {
    const produto = encontrarProduto(params["id"]!);
    const payload = (body ?? {}) as CriarVarianteRequest;
    validarVariante(produto, payload);
    const variante: Variante = {
      id: gerarId("var"),
      codVariante: payload.codVariante.trim(),
      cor: payload.cor.trim(),
      quantidadeVariante: 0,
      foto: payload.foto?.trim() || null,
      video: payload.video?.trim() || null,
      tamanhos: [],
    };
    produto.variantes.push(variante);
    recalcularProduto(produto);
    return { data: clonar(variante) };
  });

  registerMock("PUT", "/produtos/:id/variantes/:varianteId", ({ params, body }) => {
    const produto = encontrarProduto(params["id"]!);
    const variante = encontrarVariante(produto, params["varianteId"]!);
    const payload = (body ?? {}) as CriarVarianteRequest;
    validarVariante(produto, payload, variante.id);
    variante.codVariante = payload.codVariante.trim();
    variante.cor = payload.cor.trim();
    variante.foto = payload.foto?.trim() || null;
    variante.video = payload.video?.trim() || null;
    recalcularProduto(produto);
    return { data: clonar(variante) };
  });

  registerMock("DELETE", "/produtos/:id/variantes/:varianteId", ({ params }) => {
    const produto = encontrarProduto(params["id"]!);
    const index = produto.variantes.findIndex((v) => v.id === params["varianteId"]);
    if (index < 0) throw ApiError.notFound("Variante não encontrada.");
    produto.variantes.splice(index, 1);
    recalcularProduto(produto);
    return { data: clonar(produto) };
  });

  registerMock("POST", "/produtos/:id/variantes/:varianteId/tamanhos", ({ params, body }) => {
    const produto = encontrarProduto(params["id"]!);
    const variante = encontrarVariante(produto, params["varianteId"]!);
    const payload = (body ?? {}) as AdicionarTamanhoRequest;

    const errors: ApiFieldError[] = [];
    if (!payload.tamanho?.trim())
      errors.push({ field: "tamanho", message: "Tamanho é obrigatório." });
    if (payload.quantidade === undefined || payload.quantidade < 0)
      errors.push({ field: "quantidade", message: "Quantidade deve ser maior ou igual a zero." });
    if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

    const tamanho = normalizarTamanho(payload.tamanho);

    const duplicado = variante.tamanhos.some((t) => normalizarTamanho(t.tamanho) === tamanho);
    if (duplicado) {
      throw ApiError.validation("Dados inválidos.", [
        { field: "tamanho", message: "Este tamanho já está cadastrado nesta variante." },
      ]);
    }

    validarRegraTamanhoUnico(variante, tamanho);

    variante.tamanhos.push({
      id: gerarId("tam"),
      tamanho,
      quantidade: payload.quantidade,
    });
    recalcularProduto(produto);
    return { data: clonar(variante) };
  });

  registerMock(
    "DELETE",
    "/produtos/:id/variantes/:varianteId/tamanhos/:tamanhoId",
    ({ params }) => {
      const produto = encontrarProduto(params["id"]!);
      const variante = encontrarVariante(produto, params["varianteId"]!);
      const index = variante.tamanhos.findIndex((t) => t.id === params["tamanhoId"]);
      if (index < 0) throw ApiError.notFound("Tamanho não encontrado.");
      variante.tamanhos.splice(index, 1);
      recalcularProduto(produto);
      return { data: clonar(variante) };
    },
  );
}
