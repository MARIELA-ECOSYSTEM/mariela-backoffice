import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId } from "./db";
import { ApiError, type ApiFieldError } from "@/types/api";
import type { Cliente, ClientePayload } from "@/types/cliente";
import type { Fornecedor, FornecedorPayload } from "@/types/fornecedor";
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

/** Valida nome + período (inicio/fim) usado por coleções e campanhas. */
function validarPeriodo(body: unknown): {
  nome: string;
  descricao: string;
  inicio: string;
  fim: string;
  ativo: boolean;
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

  return { nome, descricao: texto(payload.descricao), inicio, fim, ativo: booleano(payload.ativo) };
}

function registrarClientes(): void {
  registerMock("GET", "/clientes", () => ({
    data: clonar(db.clientes),
    meta: { total: db.clientes.length },
  }));

  registerMock("GET", "/clientes/:id", ({ params }) => ({
    data: clonar(encontrar(db.clientes, params['id']!, "Cliente")),
  }));

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
      nome,
      telefone,
      dataNascimento: texto(payload.dataNascimento) || null,
      observacao: texto(payload.observacao),
      ativo: booleano(payload.ativo),
      criadoEm: agora(),
      atualizadoEm: agora(),
    };
    db.clientes.unshift(cliente);
    return { data: clonar(cliente) };
  });

  registerMock("PUT", "/clientes/:id", ({ params, body }) => {
    const cliente = encontrar(db.clientes, params['id']!, "Cliente");
    const payload = (body ?? {}) as Partial<ClientePayload>;
    const errors: ApiFieldError[] = [];
    const nome = texto(payload.nome);
    const telefone = texto(payload.telefone);
    if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
    if (!telefone) errors.push({ field: "telefone", message: "Telefone é obrigatório." });
    validar(errors);

    cliente.nome = nome;
    cliente.telefone = telefone;
    cliente.dataNascimento = texto(payload.dataNascimento) || null;
    cliente.observacao = texto(payload.observacao);
    cliente.ativo = booleano(payload.ativo, cliente.ativo);
    cliente.atualizadoEm = agora();
    return { data: clonar(cliente) };
  });

  registerMock("DELETE", "/clientes/:id", ({ params }) => {
    const cliente = encontrar(db.clientes, params['id']!, "Cliente");
    db.clientes = db.clientes.filter((item) => item.id !== cliente.id);
    return { data: { id: cliente.id } };
  });
}

function registrarFornecedores(): void {
  registerMock("GET", "/fornecedores", () => ({
    data: clonar(db.fornecedores),
    meta: { total: db.fornecedores.length },
  }));

  registerMock("GET", "/fornecedores/:id", ({ params }) => ({
    data: clonar(encontrar(db.fornecedores, params['id']!, "Fornecedor")),
  }));

  registerMock("POST", "/fornecedores", ({ body }) => {
    const payload = (body ?? {}) as Partial<FornecedorPayload>;
    const errors: ApiFieldError[] = [];
    const nome = texto(payload.nome);
    if (!nome) errors.push({ field: "nome", message: "Nome é obrigatório." });
    validar(errors);

    const fornecedor: Fornecedor = {
      id: gerarId("for"),
      nome,
      contato: texto(payload.contato),
      telefone: texto(payload.telefone),
      criadoEm: agora(),
    };
    db.fornecedores.unshift(fornecedor);
    return { data: clonar(fornecedor) };
  });

  registerMock("PUT", "/fornecedores/:id", ({ params, body }) => {
    const fornecedor = encontrar(db.fornecedores, params['id']!, "Fornecedor");
    const payload = (body ?? {}) as Partial<FornecedorPayload>;
    const nome = texto(payload.nome);
    if (!nome) validar([{ field: "nome", message: "Nome é obrigatório." }]);
    fornecedor.nome = nome;
    fornecedor.contato = texto(payload.contato);
    fornecedor.telefone = texto(payload.telefone);
    return { data: clonar(fornecedor) };
  });

  registerMock("DELETE", "/fornecedores/:id", ({ params }) => {
    const fornecedor = encontrar(db.fornecedores, params['id']!, "Fornecedor");
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

function registrarColecoes(): void {
  registerMock("GET", "/colecoes", () => ({
    data: clonar(db.colecoes),
    meta: { total: db.colecoes.length },
  }));

  registerMock("GET", "/colecoes/:id", ({ params }) => ({
    data: clonar(encontrar(db.colecoes, params['id']!, "Coleção")),
  }));

  registerMock("POST", "/colecoes", ({ body }) => {
    const colecao: Colecao = { id: gerarId("col"), ...validarPeriodo(body), criadoEm: agora() };
    db.colecoes.unshift(colecao);
    return { data: clonar(colecao) };
  });

  registerMock("PUT", "/colecoes/:id", ({ params, body }) => {
    const colecao = encontrar(db.colecoes, params['id']!, "Coleção");
    Object.assign(colecao, validarPeriodo(body));
    return { data: clonar(colecao) };
  });

  registerMock("DELETE", "/colecoes/:id", ({ params }) => {
    const colecao = encontrar(db.colecoes, params['id']!, "Coleção");
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

function registrarCampanhas(): void {
  registerMock("GET", "/campanhas", () => ({
    data: clonar(db.campanhas),
    meta: { total: db.campanhas.length },
  }));

  registerMock("GET", "/campanhas/:id", ({ params }) => ({
    data: clonar(encontrar(db.campanhas, params['id']!, "Campanha")),
  }));

  registerMock("POST", "/campanhas", ({ body }) => {
    const campanha: Campanha = { id: gerarId("cam"), ...validarPeriodo(body), criadoEm: agora() };
    db.campanhas.unshift(campanha);
    return { data: clonar(campanha) };
  });

  registerMock("PUT", "/campanhas/:id", ({ params, body }) => {
    const campanha = encontrar(db.campanhas, params['id']!, "Campanha");
    Object.assign(campanha, validarPeriodo(body as Partial<CampanhaPayload>));
    return { data: clonar(campanha) };
  });

  registerMock("DELETE", "/campanhas/:id", ({ params }) => {
    const campanha = encontrar(db.campanhas, params['id']!, "Campanha");
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
