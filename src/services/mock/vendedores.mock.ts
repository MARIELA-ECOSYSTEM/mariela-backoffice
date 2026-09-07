import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId, sincronizarAgregadosVendedores } from "./db";
import { vendasDoVendedor } from "./vendedores-vendas.seed";
import { proximoCodigo } from "./sequencias";
import { facetasVendedor } from "@/lib/filtros/vendedores-facetas";
import {
  calcularFacetasApi,
  filtrarPorSelecao,
  lerSelecaoDaQuery,
} from "@/lib/filtros/facetas-servidor";
import { ApiError, type ApiFieldError } from "@/types/api";
import type { Vendedor, VendedorPayload } from "@/types/vendedor";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function encontrar(id: string): Vendedor {
  const vendedor = db.vendedores.find((item) => item.id === id);
  if (!vendedor) throw ApiError.notFound("Vendedor(a) não encontrado(a).");
  return vendedor;
}

/** Simulação de hash: a API real (NestJS) fará o hash de verdade. */
function hashSimulado(senha: string): string {
  return `mock$${senha.length}$${btoa(unescape(encodeURIComponent(senha))).slice(0, 24)}`;
}

function validarDados(body: unknown, exigirSenha: boolean) {
  const payload = (body ?? {}) as Partial<VendedorPayload>;
  const errors: ApiFieldError[] = [];
  const nome = texto(payload.nome);
  const telefone = texto(payload.telefone);
  const senha = texto(payload.senha);

  if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
  if (exigirSenha && !senha) errors.push({ field: "senha", message: "Senha é obrigatória." });
  if (senha && senha.length < 6)
    errors.push({ field: "senha", message: "A senha deve ter ao menos 6 caracteres." });
  if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

  return {
    nome,
    telefone,
    foto: texto(payload.foto) || null,
    dataNascimento: texto(payload.dataNascimento) || null,
    observacao: texto(payload.observacao),
    ativo: typeof payload.ativo === "boolean" ? payload.ativo : true,
    senha,
  };
}

/** Mesmo `ordenarPor`/`ordem` do contrato real. */
function ordenarVendedoresPorCampo(lista: Vendedor[], campo: string, ordem: string): Vendedor[] {
  const fator = ordem === "desc" ? -1 : 1;
  const tempo = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "vendas":
        return (a.vendas - b.vendas) * fator;
      case "totalVendido":
        return (a.totalVendido - b.totalVendido) * fator;
      case "ultimaVenda":
        return (tempo(a.ultimaVenda) - tempo(b.ultimaVenda)) * fator;
      case "dataNascimento":
        return (tempo(a.dataNascimento) - tempo(b.dataNascimento)) * fator;
      case "criadoEm":
        return (tempo(a.criadoEm) - tempo(b.criadoEm)) * fator;
      default:
        return a.nome.localeCompare(b.nome, "pt-BR") * fator;
    }
  });
}

export function registerVendedoresMocks(): void {
  registerMock("GET", "/vendedores", ({ query }) => {
    // Agregados de vendas são responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosVendedores();

    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    let lista = db.vendedores.filter((vendedor) => {
      if (!busca) return true;
      return (
        vendedor.nome.toLowerCase().includes(busca) ||
        vendedor.codigo.toLowerCase().includes(busca) ||
        vendedor.telefone.toLowerCase().includes(busca)
      );
    });

    // Facetas: counts sempre sobre o conjunto completo desta busca (nunca
    // sobre a página) — mesmo comportamento já usado por Produtos/Clientes/Fornecedores/Coleções/Campanhas.
    const selecao = lerSelecaoDaQuery(query, facetasVendedor);
    const facets = calcularFacetasApi(lista, facetasVendedor, selecao);

    lista = filtrarPorSelecao(lista, facetasVendedor, selecao);
    lista = ordenarVendedoresPorCampo(
      lista,
      String(query["ordenarPor"] ?? "nome"),
      String(query["ordem"] ?? "asc"),
    );

    // Paginação real, espelhando o backend: `page`/`limit` fatiam a lista já
    // filtrada/ordenada, e `total`/`totalPages` refletem o conjunto INTEIRO.
    const total = lista.length;
    const limit = Math.max(1, Number(query["limit"]) || 20);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, Number(query["page"]) || 1), totalPages);
    const inicio = (page - 1) * limit;
    const pagina = lista.slice(inicio, inicio + limit);

    return { data: clonar(pagina), meta: { total, page, limit, totalPages }, facets };
  });

  registerMock("GET", "/vendedores/:id", ({ params }) => {
    sincronizarAgregadosVendedores();
    return { data: clonar(encontrar(params["id"]!)) };
  });

  /**
   * Histórico de vendas do vendedor (somente leitura — a venda pertence ao PDV).
   * Contrato: GET /vendedores/:id/vendas
   */
  registerMock("GET", "/vendedores/:id/vendas", ({ params }) => {
    const vendedor = encontrar(params["id"]!);
    const vendas = vendasDoVendedor(vendedor.id, db.vendas);
    return { data: clonar(vendas), meta: { total: vendas.length } };
  });

  registerMock("POST", "/vendedores", ({ body }) => {
    const dados = validarDados(body, true);
    const vendedor: Vendedor = {
      id: gerarId("ven"),
      codigo: proximoCodigo("vendedor"),
      nome: dados.nome,
      foto: dados.foto,
      telefone: dados.telefone,
      dataNascimento: dados.dataNascimento,
      observacao: dados.observacao,
      ativo: dados.ativo,
      criadoEm: agora(),
      atualizadoEm: agora(),
      vendas: 0,
      totalVendido: 0,
      ultimaVenda: null,
    };
    db.vendedores.unshift(vendedor);
    db.vendedoresSenhas[vendedor.id] = hashSimulado(dados.senha);
    return { data: clonar(vendedor) };
  });

  registerMock("PUT", "/vendedores/:id", ({ params, body }) => {
    const vendedor = encontrar(params["id"]!);
    const dados = validarDados(body, false);
    vendedor.nome = dados.nome;
    vendedor.foto = dados.foto;
    vendedor.telefone = dados.telefone;
    vendedor.dataNascimento = dados.dataNascimento;
    vendedor.observacao = dados.observacao;
    vendedor.ativo = dados.ativo;
    vendedor.atualizadoEm = agora();
    if (dados.senha) db.vendedoresSenhas[vendedor.id] = hashSimulado(dados.senha);
    return { data: clonar(vendedor) };
  });

  registerMock("PATCH", "/vendedores/:id/status", ({ params, body }) => {
    const vendedor = encontrar(params["id"]!);
    const payload = (body ?? {}) as { ativo?: boolean };
    vendedor.ativo = typeof payload.ativo === "boolean" ? payload.ativo : !vendedor.ativo;
    vendedor.atualizadoEm = agora();
    return { data: clonar(vendedor) };
  });

  registerMock("PATCH", "/vendedores/:id/senha", ({ params, body }) => {
    const vendedor = encontrar(params["id"]!);
    const senha = texto((body as { senha?: string } | null)?.senha);
    if (senha.length < 6)
      throw ApiError.validation("Dados inválidos.", [
        { field: "senha", message: "A senha deve ter ao menos 6 caracteres." },
      ]);
    db.vendedoresSenhas[vendedor.id] = hashSimulado(senha);
    vendedor.atualizadoEm = agora();
    return { data: { id: vendedor.id } };
  });

  registerMock("DELETE", "/vendedores/:id", ({ params }) => {
    const vendedor = encontrar(params["id"]!);
    db.vendedores = db.vendedores.filter((item) => item.id !== vendedor.id);
    delete db.vendedoresSenhas[vendedor.id];
    return { data: { id: vendedor.id } };
  });
}
