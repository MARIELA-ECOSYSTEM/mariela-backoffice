import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { agora, clonar, db } from "./db";
import type { Configuracoes, DadosLoja, ListaConfiguravel } from "@/types/configuracoes";

const LISTAS: ListaConfiguravel[] = ["categorias", "tamanhos", "cores", "formasPagamento"];

function validarLista(nome: string): ListaConfiguravel {
  if (!LISTAS.includes(nome as ListaConfiguravel)) throw ApiError.notFound("Lista não encontrada.");
  return nome as ListaConfiguravel;
}

export function registerConfiguracoesMocks(): void {
  registerMock("GET", "/configuracoes", () => ({ data: clonar(db.configuracoes) }));

  registerMock("PUT", "/configuracoes/loja", ({ body }) => {
    const payload = (body ?? {}) as DadosLoja;
    const errors: ApiFieldError[] = [];
    if (!payload.nome?.trim())
      errors.push({ field: "nome", message: "Nome da loja é obrigatório." });
    if (!payload.email?.trim()) errors.push({ field: "email", message: "E-mail é obrigatório." });
    if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

    db.configuracoes.loja = {
      ...db.configuracoes.loja,
      ...payload,
      endereco: { ...db.configuracoes.loja.endereco, ...payload.endereco },
    };
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) };
  });

  registerMock("POST", "/configuracoes/:lista", ({ params, body }) => {
    const lista = validarLista(params["lista"]!);
    const valor = String((body as { valor?: string } | undefined)?.valor ?? "").trim();
    if (!valor) {
      throw ApiError.validation("Dados inválidos.", [
        { field: "valor", message: "Informe um valor." },
      ]);
    }
    const existe = db.configuracoes[lista].some(
      (item) => item.toLowerCase() === valor.toLowerCase(),
    );
    if (existe) {
      throw ApiError.validation("Dados inválidos.", [
        { field: "valor", message: "Este item já está cadastrado." },
      ]);
    }
    db.configuracoes[lista].push(valor);
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) as Configuracoes };
  });

  registerMock("DELETE", "/configuracoes/:lista/:valor", ({ params }) => {
    const lista = validarLista(params["lista"]!);
    const valor = params["valor"]!;
    const index = db.configuracoes[lista].findIndex((item) => item === valor);
    if (index < 0) throw ApiError.notFound("Item não encontrado.");
    db.configuracoes[lista].splice(index, 1);
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) };
  });
}
