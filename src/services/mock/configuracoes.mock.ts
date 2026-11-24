import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { agora, clonar, db } from "./db";
import {
  LIMITES_MENSAGEM_PADRAO_WHATSAPP,
  type Configuracoes,
  type DadosLoja,
  type ListaConfiguravel,
  type SalvarMensagemPadraoWhatsapp,
} from "@/types/configuracoes";

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

  // Fase 22.8.9.10.7.3 — mensagens padrão de WhatsApp (mesmas regras do backend).
  const MENSAGENS = "/configuracoes/whatsapp/mensagens-padrao";
  const mensagens = () => (db.configuracoes.mensagensWhatsapp ??= []);

  function validarMensagem(body: unknown, idAtual: string | null): SalvarMensagemPadraoWhatsapp {
    const b = (body ?? {}) as Partial<SalvarMensagemPadraoWhatsapp>;
    const titulo = String(b.titulo ?? "").trim();
    const conteudo = String(b.conteudo ?? "").trim();
    const errors: ApiFieldError[] = [];
    if (!titulo) errors.push({ field: "titulo", message: "Informe um título." });
    else if (titulo.length > LIMITES_MENSAGEM_PADRAO_WHATSAPP.titulo)
      errors.push({ field: "titulo", message: "Título longo demais." });
    if (!conteudo) errors.push({ field: "conteudo", message: "Informe o texto da mensagem." });
    else if (conteudo.length > LIMITES_MENSAGEM_PADRAO_WHATSAPP.conteudo)
      errors.push({ field: "conteudo", message: "Mensagem longa demais." });
    if (errors.length) throw ApiError.validation("Dados inválidos.", errors);
    if (
      mensagens().some((m) => m.id !== idAtual && m.titulo.toLowerCase() === titulo.toLowerCase())
    )
      throw ApiError.conflict(`Já existe uma mensagem padrão com o título "${titulo}".`);
    return { titulo, conteudo };
  }

  registerMock("POST", MENSAGENS, ({ body }) => {
    const dados = validarMensagem(body, null);
    if (mensagens().length >= LIMITES_MENSAGEM_PADRAO_WHATSAPP.quantidade)
      throw ApiError.validation("Limite de mensagens padrão atingido.");
    mensagens().push({ id: crypto.randomUUID(), ...dados, atualizadoEm: agora() });
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) };
  });

  registerMock("PUT", `${MENSAGENS}/:id`, ({ params, body }) => {
    const alvo = mensagens().find((m) => m.id === params["id"]);
    if (!alvo) throw ApiError.notFound("Mensagem padrão não encontrada.");
    Object.assign(alvo, validarMensagem(body, alvo.id), { atualizadoEm: agora() });
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) };
  });

  registerMock("DELETE", `${MENSAGENS}/:id`, ({ params }) => {
    const indice = mensagens().findIndex((m) => m.id === params["id"]);
    if (indice < 0) throw ApiError.notFound("Mensagem padrão não encontrada.");
    mensagens().splice(indice, 1);
    db.configuracoes.atualizadoEm = agora();
    return { data: clonar(db.configuracoes) };
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
