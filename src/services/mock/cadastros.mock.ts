import { registerMock } from "./mock-transport";
import {
  agora,
  clonar,
  db,
  gerarId,
  sincronizarAgregadosClientes,
  sincronizarAgregadosFornecedores,
} from "./db";
import { historicoDoFornecedor } from "./fornecedores-historico.seed";
import { vendasDoCliente } from "./clientes-vendas.seed";
import { proximoCodigo } from "./sequencias";
import { ApiError, type ApiFieldError } from "@/types/api";
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

/** `produtosVinculados` é sempre um agregado — nunca um campo editável (mesmo padrão de Fornecedor). */
function sincronizarAgregadosColecoes(): void {
  db.colecoes.forEach((colecao) => {
    colecao.produtosVinculados = db.produtos.filter(
      (produto) => produto.colecaoId === colecao.id,
    ).length;
  });
}

function sincronizarAgregadosCampanhas(): void {
  db.campanhas.forEach((campanha) => {
    campanha.produtosVinculados = db.produtos.filter(
      (produto) => produto.campanhaId === campanha.id,
    ).length;
  });
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

function registrarClientes(): void {
  registerMock("GET", "/clientes", () => {
    // Os agregados de compras são responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosClientes();
    return { data: clonar(db.clientes), meta: { total: db.clientes.length } };
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

function registrarFornecedores(): void {
  registerMock("GET", "/fornecedores", () => {
    // Agregados comerciais são responsabilidade da camada de dados (futuro NestJS).
    sincronizarAgregadosFornecedores();
    return { data: clonar(db.fornecedores), meta: { total: db.fornecedores.length } };
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

function registrarColecoes(): void {
  registerMock("GET", "/colecoes", () => {
    sincronizarAgregadosColecoes();
    return { data: clonar(db.colecoes), meta: { total: db.colecoes.length } };
  });

  registerMock("GET", "/colecoes/:id", ({ params }) => {
    sincronizarAgregadosColecoes();
    return { data: clonar(encontrar(db.colecoes, params["id"]!, "Coleção")) };
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

function registrarCampanhas(): void {
  registerMock("GET", "/campanhas", () => {
    sincronizarAgregadosCampanhas();
    return { data: clonar(db.campanhas), meta: { total: db.campanhas.length } };
  });

  registerMock("GET", "/campanhas/:id", ({ params }) => {
    sincronizarAgregadosCampanhas();
    return { data: clonar(encontrar(db.campanhas, params["id"]!, "Campanha")) };
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
