import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId } from "./db";
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

export function registerVendedoresMocks(): void {
  registerMock("GET", "/vendedores", () => ({
    data: clonar(db.vendedores),
    meta: { total: db.vendedores.length },
  }));

  registerMock("GET", "/vendedores/:id", ({ params }) => ({
    data: clonar(encontrar(params["id"]!)),
  }));

  registerMock("POST", "/vendedores", ({ body }) => {
    const dados = validarDados(body, true);
    const vendedor: Vendedor = {
      id: gerarId("ven"),
      nome: dados.nome,
      foto: dados.foto,
      telefone: dados.telefone,
      dataNascimento: dados.dataNascimento,
      observacao: dados.observacao,
      ativo: dados.ativo,
      criadoEm: agora(),
      atualizadoEm: agora(),
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
