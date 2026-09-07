import { registerMock } from "./mock-transport";
import {
  agora,
  clonar,
  db,
  gerarId,
  sincronizarAgregadosCampanhas,
  sincronizarAgregadosClientes,
  sincronizarAgregadosColecoes,
  sincronizarAgregadosFornecedores,
} from "./db";
import { historicoDoFornecedor } from "./fornecedores-historico.seed";
import { vendasDoCliente } from "./clientes-vendas.seed";
import { proximoCodigo } from "./sequencias";
import { ApiError, type ApiFieldError } from "@/types/api";
import { facetasCampanha } from "@/lib/filtros/campanhas-facetas";
import { facetasCliente } from "@/lib/filtros/clientes-facetas";
import { facetasColecao } from "@/lib/filtros/colecoes-facetas";
import { facetasFornecedor } from "@/lib/filtros/fornecedores-facetas";
import {
  calcularFacetasApi,
  filtrarPorSelecao,
  lerSelecaoDaQuery,
} from "@/lib/filtros/facetas-servidor";
import type { Cliente, ClientePayload } from "@/types/cliente";
import type { EnderecoFornecedor, Fornecedor, FornecedorPayload } from "@/types/fornecedor";
import type { Colecao, ColecaoPayload } from "@/types/colecao";
import type { Campanha, CampanhaPayload } from "@/types/campanha";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function booleano(valor: unknown, padrao = true): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

function validar(errors: ApiFieldError[]): void {
  if (errors.length) throw ApiError.validation("Dados inválidos.", errors);
}

function encontrar<T extends { id: string }>(lista: T[], id: string, rotulo: string): T {
  const item = lista.find((registro) => registro.id === id);
  if (!item) throw ApiError.notFound(`${rotulo} não encontrado(a).`);
  return item;
}

/** Valida nome + período + dados de vitrine usados por coleções e campanhas. */
function validarPeriodo(body: unknown): {
  nome: string;
  descricao: string;
  inicio: string;
  fim: string;
  ativo: boolean;
  destaque: boolean;
  banner: boolean;
  fotoDestaque: string | null;
  fotoBanner: string | null;
} {
  const payload = (body ?? {}) as Partial<ColecaoPayload>;
  const errors: ApiFieldError[] = [];
  const nome = texto(payload.nome);
  const inicio = texto(payload.inicio);
  const fim = texto(payload.fim);

  if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
  if (!inicio) errors.push({ field: "inicio", message: "Data de início é obrigatória." });
  if (!fim) errors.push({ field: "fim", message: "Data de fim é obrigatória." });
  if (inicio && fim && fim < inicio)
    errors.push({ field: "fim", message: "A data de fim deve ser posterior ao início." });
  validar(errors);

  const destaque = booleano(payload.destaque, false);
  const banner = booleano(payload.banner, false);

  return {
    nome,
    descricao: texto(payload.descricao),
    inicio,
    fim,
    ativo: booleano(payload.ativo),
    destaque,
    banner,
    // As imagens só fazem sentido quando o respectivo uso está habilitado.
    fotoDestaque: destaque ? texto(payload.fotoDestaque) || null : null,
    fotoBanner: banner ? texto(payload.fotoBanner) || null : null,
  };
}

/** Mesmo `ordenarPor`/`ordem` do contrato real — nunca ordena no array inteiro sem paginar depois. */
function ordenarClientesPorCampo(lista: Cliente[], campo: string, ordem: string): Cliente[] {
  const fator = ordem === "desc" ? -1 : 1;
  const tempo = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "compras":
        return (a.compras - b.compras) * fator;
      case "totalComprado":
        return (a.totalComprado - b.totalComprado) * fator;
      case "ultimaCompra":
        return (tempo(a.ultimaCompra) - tempo(b.ultimaCompra)) * fator;
      case "criadoEm":
        return (tempo(a.criadoEm) - tempo(b.criadoEm)) * fator;
      default:
        return a.nome.localeCompare(b.nome, "pt-BR") * fator;
    }
  });
}

function registrarClientes(): void {
  registerMock("GET", "/clientes", ({ query }) => {
    // Os agregados de compras são responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosClientes();

    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    let lista = db.clientes.filter((cliente) => {
      if (!busca) return true;
      return (
        cliente.nome.toLowerCase().includes(busca) || cliente.telefone.toLowerCase().includes(busca)
      );
    });

    // Facetas: counts sempre sobre o conjunto completo desta busca (nunca
    // sobre a página), recalculados conforme os filtros combinados — mesmo
    // comportamento já usado por Produtos.
    const selecao = lerSelecaoDaQuery(query, facetasCliente);
    const facets = calcularFacetasApi(lista, facetasCliente, selecao);

    lista = filtrarPorSelecao(lista, facetasCliente, selecao);
    lista = ordenarClientesPorCampo(
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

  registerMock("GET", "/clientes/:id", ({ params }) => {
    sincronizarAgregadosClientes();
    return { data: clonar(encontrar(db.clientes, params["id"]!, "Cliente")) };
  });

  /** Histórico de compras do cliente (somente leitura — a venda pertence ao PDV). */
  registerMock("GET", "/clientes/:id/vendas", ({ params }) => {
    const cliente = encontrar(db.clientes, params["id"]!, "Cliente");
    const vendas = vendasDoCliente(cliente.id, db.vendas);
    return { data: clonar(vendas), meta: { total: vendas.length } };
  });

  registerMock("POST", "/clientes", ({ body }) => {
    const payload = (body ?? {}) as Partial<ClientePayload>;
    const errors: ApiFieldError[] = [];
    const nome = texto(payload.nome);
    const telefone = texto(payload.telefone);
    if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
    if (!telefone) errors.push({ field: "telefone", message: "Telefone é obrigatório." });
    validar(errors);

    const cliente: Cliente = {
      id: gerarId("cli"),
      // Código gerado pela camada de dados — nunca enviado pelo formulário.
      codigo: proximoCodigo("cliente"),
      nome,
      foto: texto(payload.foto) || null,
      telefone,
      dataNascimento: texto(payload.dataNascimento) || null,
      observacao: texto(payload.observacao),
      criadoEm: agora(),
      atualizadoEm: agora(),
      compras: 0,
      totalComprado: 0,
      ultimaCompra: null,
    };
    db.clientes.unshift(cliente);
    return { data: clonar(cliente) };
  });

  registerMock("PUT", "/clientes/:id", ({ params, body }) => {
    const cliente = encontrar(db.clientes, params["id"]!, "Cliente");
    const payload = (body ?? {}) as Partial<ClientePayload>;
    const errors: ApiFieldError[] = [];
    const nome = texto(payload.nome);
    const telefone = texto(payload.telefone);
    if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
    if (!telefone) errors.push({ field: "telefone", message: "Telefone é obrigatório." });
    validar(errors);

    cliente.nome = nome;
    cliente.foto = texto(payload.foto) || null;
    cliente.telefone = telefone;
    cliente.dataNascimento = texto(payload.dataNascimento) || null;
    cliente.observacao = texto(payload.observacao);
    cliente.atualizadoEm = agora();
    return { data: clonar(cliente) };
  });

  registerMock("DELETE", "/clientes/:id", ({ params }) => {
    const cliente = encontrar(db.clientes, params["id"]!, "Cliente");
    db.clientes = db.clientes.filter((item) => item.id !== cliente.id);
    return { data: { id: cliente.id } };
  });
}

/**
 * Endereço é totalmente opcional. Quando nenhum campo é informado, a API
 * persiste `null` (e não um objeto vazio).
 */
function endereco(valor: unknown): EnderecoFornecedor | null {
  const bruto = (valor ?? {}) as Partial<EnderecoFornecedor>;
  const endereco: EnderecoFornecedor = {
    cep: texto(bruto.cep),
    logradouro: texto(bruto.logradouro),
    numero: texto(bruto.numero),
    complemento: texto(bruto.complemento),
    bairro: texto(bruto.bairro),
    cidade: texto(bruto.cidade),
    estado: texto(bruto.estado).toUpperCase().slice(0, 2),
  };
  return Object.values(endereco).some((campo) => campo.length > 0) ? endereco : null;
}

/** Mesmo `ordenarPor`/`ordem` do contrato real. */
function ordenarFornecedoresPorCampo(
  lista: Fornecedor[],
  campo: string,
  ordem: string,
): Fornecedor[] {
  const fator = ordem === "desc" ? -1 : 1;
  const tempo = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "produtosVinculados":
        return (a.produtosVinculados - b.produtosVinculados) * fator;
      case "valorEmCusto":
        return (a.valorEmCusto - b.valorEmCusto) * fator;
      case "ultimaEntrada":
        return (tempo(a.ultimaEntrada) - tempo(b.ultimaEntrada)) * fator;
      case "criadoEm":
        return (tempo(a.criadoEm) - tempo(b.criadoEm)) * fator;
      default:
        return a.nome.localeCompare(b.nome, "pt-BR") * fator;
    }
  });
}

function registrarFornecedores(): void {
  registerMock("GET", "/fornecedores", ({ query }) => {
    // Agregados comerciais são responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosFornecedores();

    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    let lista = db.fornecedores.filter((fornecedor) => {
      if (!busca) return true;
      return (
        fornecedor.nome.toLowerCase().includes(busca) ||
        fornecedor.codigo.toLowerCase().includes(busca) ||
        fornecedor.contato.toLowerCase().includes(busca) ||
        fornecedor.telefone.toLowerCase().includes(busca) ||
        fornecedor.cnpj.toLowerCase().includes(busca)
      );
    });

    // Facetas: counts sempre sobre o conjunto completo desta busca (nunca
    // sobre a página) — mesmo comportamento já usado por Produtos/Clientes.
    const selecao = lerSelecaoDaQuery(query, facetasFornecedor);
    const facets = calcularFacetasApi(lista, facetasFornecedor, selecao);

    lista = filtrarPorSelecao(lista, facetasFornecedor, selecao);
    lista = ordenarFornecedoresPorCampo(
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

  registerMock("GET", "/fornecedores/:id", ({ params }) => {
    sincronizarAgregadosFornecedores();
    return { data: clonar(encontrar(db.fornecedores, params["id"]!, "Fornecedor")) };
  });

  /**
   * Histórico de produtos que estão ou já estiveram vinculados ao fornecedor.
   * Contrato: GET /fornecedores/:id/historico
   */
  registerMock("GET", "/fornecedores/:id/historico", ({ params }) => {
    const fornecedor = encontrar(db.fornecedores, params["id"]!, "Fornecedor");
    const itens = historicoDoFornecedor(fornecedor.id, db.fornecedoresHistorico, db.produtos);
    return { data: clonar(itens), meta: { total: itens.length } };
  });

  registerMock("POST", "/fornecedores", ({ body }) => {
    const payload = (body ?? {}) as Partial<FornecedorPayload>;
    const errors: ApiFieldError[] = [];
    const nome = texto(payload.nome);
    if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
    validar(errors);

    const fornecedor: Fornecedor = {
      id: gerarId("for"),
      // Código gerado pela camada de dados — nunca enviado pelo formulário.
      codigo: proximoCodigo("fornecedor"),
      nome,
      foto: texto(payload.foto) || null,
      contato: texto(payload.contato),
      telefone: texto(payload.telefone),
      email: texto(payload.email),
      cnpj: texto(payload.cnpj),
      instagram: texto(payload.instagram),
      observacao: texto(payload.observacao),
      endereco: endereco(payload.endereco),
      criadoEm: agora(),
      atualizadoEm: agora(),
      produtosVinculados: 0,
      valorEmCusto: 0,
      ultimaEntrada: null,
    };
    db.fornecedores.unshift(fornecedor);
    return { data: clonar(fornecedor) };
  });

  registerMock("PUT", "/fornecedores/:id", ({ params, body }) => {
    const fornecedor = encontrar(db.fornecedores, params["id"]!, "Fornecedor");
    const payload = (body ?? {}) as Partial<FornecedorPayload>;
    const nome = texto(payload.nome);
    if (!nome) validar([{ field: "nome", message: "Nome é obrigatório." }]);
    fornecedor.nome = nome;
    fornecedor.foto = texto(payload.foto) || null;
    fornecedor.contato = texto(payload.contato);
    fornecedor.telefone = texto(payload.telefone);
    fornecedor.email = texto(payload.email);
    fornecedor.cnpj = texto(payload.cnpj);
    fornecedor.instagram = texto(payload.instagram);
    fornecedor.observacao = texto(payload.observacao);
    fornecedor.endereco = endereco(payload.endereco);
    fornecedor.atualizadoEm = agora();
    sincronizarAgregadosFornecedores();
    return { data: clonar(fornecedor) };
  });

  registerMock("DELETE", "/fornecedores/:id", ({ params }) => {
    const fornecedor = encontrar(db.fornecedores, params["id"]!, "Fornecedor");
    const vinculados = db.produtos.filter((p) => p.fornecedorId === fornecedor.id).length;
    if (vinculados > 0) {
      throw ApiError.validation("Fornecedor possui produtos vinculados.", [
        { field: "id", message: `${vinculados} produto(s) usam este fornecedor.` },
      ]);
    }
    db.fornecedores = db.fornecedores.filter((item) => item.id !== fornecedor.id);
    return { data: { id: fornecedor.id } };
  });
}

/** Mesmo `ordenarPor`/`ordem` do contrato real. */
function ordenarColecoesPorCampo(lista: Colecao[], campo: string, ordem: string): Colecao[] {
  const fator = ordem === "desc" ? -1 : 1;
  const tempo = (iso: string) => new Date(iso).getTime();
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "inicio":
        return (tempo(a.inicio) - tempo(b.inicio)) * fator;
      case "fim":
        return (tempo(a.fim) - tempo(b.fim)) * fator;
      case "criadoEm":
        return (tempo(a.criadoEm) - tempo(b.criadoEm)) * fator;
      default:
        return a.nome.localeCompare(b.nome, "pt-BR") * fator;
    }
  });
}

function registrarColecoes(): void {
  registerMock("GET", "/colecoes", ({ query }) => {
    // Contagem de produtos vinculados é responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosColecoes();

    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    let lista = db.colecoes.filter((colecao) => {
      if (!busca) return true;
      return (
        colecao.nome.toLowerCase().includes(busca) ||
        colecao.descricao.toLowerCase().includes(busca) ||
        colecao.codigo.toLowerCase().includes(busca)
      );
    });

    // Facetas: counts sempre sobre o conjunto completo desta busca (nunca
    // sobre a página) — mesmo comportamento já usado por Produtos/Clientes/Fornecedores.
    const selecao = lerSelecaoDaQuery(query, facetasColecao);
    const facets = calcularFacetasApi(lista, facetasColecao, selecao);

    lista = filtrarPorSelecao(lista, facetasColecao, selecao);
    lista = ordenarColecoesPorCampo(
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

  registerMock("GET", "/colecoes/:id", ({ params }) => {
    sincronizarAgregadosColecoes();
    return { data: clonar(encontrar(db.colecoes, params["id"]!, "Coleção")) };
  });

  /** Produtos atualmente vinculados a esta coleção. Contrato: GET /colecoes/:id/produtos */
  registerMock("GET", "/colecoes/:id/produtos", ({ params }) => {
    const colecao = encontrar(db.colecoes, params["id"]!, "Coleção");
    const produtos = db.produtos.filter((produto) => produto.colecaoId === colecao.id);
    return { data: clonar(produtos), meta: { total: produtos.length } };
  });

  registerMock("POST", "/colecoes", ({ body }) => {
    const colecao: Colecao = {
      id: gerarId("col"),
      codigo: proximoCodigo("colecao"),
      ...validarPeriodo(body),
      criadoEm: agora(),
      atualizadoEm: agora(),
      produtosVinculados: 0,
    };
    db.colecoes.unshift(colecao);
    return { data: clonar(colecao) };
  });

  registerMock("PUT", "/colecoes/:id", ({ params, body }) => {
    const colecao = encontrar(db.colecoes, params["id"]!, "Coleção");
    Object.assign(colecao, validarPeriodo(body));
    colecao.atualizadoEm = agora();
    return { data: clonar(colecao) };
  });

  registerMock("PATCH", "/colecoes/:id/status", ({ params, body }) => {
    const colecao = encontrar(db.colecoes, params["id"]!, "Coleção");
    const payload = (body ?? {}) as { ativo?: boolean };
    colecao.ativo = typeof payload.ativo === "boolean" ? payload.ativo : !colecao.ativo;
    colecao.atualizadoEm = agora();
    return { data: clonar(colecao) };
  });

  registerMock("DELETE", "/colecoes/:id", ({ params }) => {
    const colecao = encontrar(db.colecoes, params["id"]!, "Coleção");
    const vinculados = db.produtos.filter((p) => p.colecaoId === colecao.id).length;
    if (vinculados > 0) {
      throw ApiError.validation("Coleção possui produtos vinculados.", [
        { field: "id", message: `${vinculados} produto(s) usam esta coleção.` },
      ]);
    }
    db.colecoes = db.colecoes.filter((item) => item.id !== colecao.id);
    return { data: { id: colecao.id } };
  });
}

/** Mesmo `ordenarPor`/`ordem` do contrato real. */
function ordenarCampanhasPorCampo(lista: Campanha[], campo: string, ordem: string): Campanha[] {
  const fator = ordem === "desc" ? -1 : 1;
  const tempo = (iso: string) => new Date(iso).getTime();
  return [...lista].sort((a, b) => {
    switch (campo) {
      case "inicio":
        return (tempo(a.inicio) - tempo(b.inicio)) * fator;
      case "fim":
        return (tempo(a.fim) - tempo(b.fim)) * fator;
      case "criadoEm":
        return (tempo(a.criadoEm) - tempo(b.criadoEm)) * fator;
      default:
        return a.nome.localeCompare(b.nome, "pt-BR") * fator;
    }
  });
}

function registrarCampanhas(): void {
  registerMock("GET", "/campanhas", ({ query }) => {
    // Contagem de produtos vinculados é responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosCampanhas();

    const busca = String(query["busca"] ?? "")
      .trim()
      .toLowerCase();
    let lista = db.campanhas.filter((campanha) => {
      if (!busca) return true;
      return (
        campanha.nome.toLowerCase().includes(busca) ||
        campanha.descricao.toLowerCase().includes(busca) ||
        campanha.codigo.toLowerCase().includes(busca)
      );
    });

    // Facetas: counts sempre sobre o conjunto completo desta busca (nunca
    // sobre a página) — mesmo comportamento já usado por Produtos/Clientes/Fornecedores/Coleções.
    const selecao = lerSelecaoDaQuery(query, facetasCampanha);
    const facets = calcularFacetasApi(lista, facetasCampanha, selecao);

    lista = filtrarPorSelecao(lista, facetasCampanha, selecao);
    lista = ordenarCampanhasPorCampo(
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

  registerMock("GET", "/campanhas/:id", ({ params }) => {
    sincronizarAgregadosCampanhas();
    return { data: clonar(encontrar(db.campanhas, params["id"]!, "Campanha")) };
  });

  /** Produtos atualmente vinculados a esta campanha. Contrato: GET /campanhas/:id/produtos */
  registerMock("GET", "/campanhas/:id/produtos", ({ params }) => {
    const campanha = encontrar(db.campanhas, params["id"]!, "Campanha");
    const produtos = db.produtos.filter((produto) => produto.campanhaId === campanha.id);
    return { data: clonar(produtos), meta: { total: produtos.length } };
  });

  registerMock("POST", "/campanhas", ({ body }) => {
    const campanha: Campanha = {
      id: gerarId("cam"),
      codigo: proximoCodigo("campanha"),
      ...validarPeriodo(body),
      criadoEm: agora(),
      atualizadoEm: agora(),
      produtosVinculados: 0,
    };
    db.campanhas.unshift(campanha);
    return { data: clonar(campanha) };
  });

  registerMock("PUT", "/campanhas/:id", ({ params, body }) => {
    const campanha = encontrar(db.campanhas, params["id"]!, "Campanha");
    Object.assign(campanha, validarPeriodo(body as Partial<CampanhaPayload>));
    campanha.atualizadoEm = agora();
    return { data: clonar(campanha) };
  });

  registerMock("PATCH", "/campanhas/:id/status", ({ params, body }) => {
    const campanha = encontrar(db.campanhas, params["id"]!, "Campanha");
    const payload = (body ?? {}) as { ativo?: boolean };
    campanha.ativo = typeof payload.ativo === "boolean" ? payload.ativo : !campanha.ativo;
    campanha.atualizadoEm = agora();
    return { data: clonar(campanha) };
  });

  registerMock("DELETE", "/campanhas/:id", ({ params }) => {
    const campanha = encontrar(db.campanhas, params["id"]!, "Campanha");
    const vinculados = db.produtos.filter((p) => p.campanhaId === campanha.id).length;
    if (vinculados > 0) {
      throw ApiError.validation("Campanha possui produtos vinculados.", [
        { field: "id", message: `${vinculados} produto(s) usam esta campanha.` },
      ]);
    }
    db.campanhas = db.campanhas.filter((item) => item.id !== campanha.id);
    return { data: { id: campanha.id } };
  });
}

/** Mocks de cadastros: clientes, fornecedores, coleções e campanhas. */
export function registerCadastrosMocks(): void {
  registrarClientes();
  registrarFornecedores();
  registrarColecoes();
  registrarCampanhas();
}
