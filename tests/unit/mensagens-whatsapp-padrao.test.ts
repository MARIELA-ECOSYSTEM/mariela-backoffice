/**
 * Fase 22.8.9.10.7.3 — mensagens padrão de WhatsApp (Configurações). Executar com: `bun test tests/unit`.
 * Sem rede: o cliente da API é observado por espiões e o contrato é exercitado na Mock API em memória.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { apiClient } from "@/services/api/client";
import { configuracoesApi } from "@/services/api/configuracoes.api";
import { handleMockRequest } from "@/services/mock/mock-transport";
import { db } from "@/services/mock/db";
import { seedConfiguracoes } from "@/services/mock/seed";
import { ApiError } from "@/types/api";
import type { Configuracoes } from "@/types/configuracoes";

const RESPOSTA = { data: {} as Configuracoes, success: true } as never;
const ID = "00000000-0000-4000-8000-000000000001";

describe("cliente da API (rotas e payloads exatos; nada além de título e conteúdo)", () => {
  const espioes: { mockRestore: () => void }[] = [];
  afterEach(() => espioes.splice(0).forEach((e) => e.mockRestore()));

  test("criar → POST /configuracoes/whatsapp/mensagens-padrao { titulo, conteudo }", async () => {
    const post = spyOn(apiClient, "post").mockResolvedValue(RESPOSTA);
    espioes.push(post);
    await configuracoesApi.criarMensagemPadrao({ titulo: "Oi", conteudo: "Olá!" });
    expect(post).toHaveBeenCalledWith("/configuracoes/whatsapp/mensagens-padrao", {
      titulo: "Oi",
      conteudo: "Olá!",
    });
  });

  test("editar → PUT …/:id (id codificado); excluir → DELETE …/:id", async () => {
    const put = spyOn(apiClient, "put").mockResolvedValue(RESPOSTA);
    const del = spyOn(apiClient, "delete").mockResolvedValue(RESPOSTA);
    espioes.push(put, del);
    await configuracoesApi.atualizarMensagemPadrao(ID, { titulo: "A", conteudo: "B" });
    await configuracoesApi.excluirMensagemPadrao("id/estranho");
    expect(put).toHaveBeenCalledWith(`/configuracoes/whatsapp/mensagens-padrao/${ID}`, {
      titulo: "A",
      conteudo: "B",
    });
    expect(del).toHaveBeenCalledWith("/configuracoes/whatsapp/mensagens-padrao/id%2Festranho");
  });
});

describe("Mock API — mesmo contrato do backend", () => {
  const pedir = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
    handleMockRequest<Configuracoes>({ method, path, params: {}, body, token: "token-ficticio" });
  const codigo = async (p: Promise<unknown>) => {
    try {
      await p;
      return "OK";
    } catch (e) {
      return e instanceof ApiError ? `${e.statusCode}` : "ERRO";
    }
  };
  afterEach(() => {
    db.configuracoes = seedConfiguracoes();
  });

  test("conjunto inicial: 6 mensagens neutras, sem 'SAIR' nem promessa de bloqueio", async () => {
    const { data } = await pedir("GET", "/configuracoes");
    const mensagens = data.mensagensWhatsapp ?? [];
    expect(mensagens.map((m) => m.titulo)).toEqual([
      "Saudação",
      "Agradecimento pela compra",
      "Pedido pronto para retirada",
      "Aviso de pagamento",
      "Aviso de pedido",
      "Atendimento personalizado",
    ]);
    for (const m of mensagens) expect(m.conteudo.toUpperCase()).not.toContain("SAIR");
  });

  test("criar, editar e excluir persistem no estado da Mock API (aparado; quebras de linha mantidas)", async () => {
    await pedir("POST", "/configuracoes/whatsapp/mensagens-padrao", {
      titulo: "  Troca  ",
      conteudo: "  Sua troca\nestá disponível.  ",
    });
    let lista = (await pedir("GET", "/configuracoes")).data.mensagensWhatsapp ?? [];
    const nova = lista.find((m) => m.titulo === "Troca")!;
    expect(nova.conteudo).toBe("Sua troca\nestá disponível.");

    await pedir("PUT", `/configuracoes/whatsapp/mensagens-padrao/${nova.id}`, {
      titulo: "Troca liberada",
      conteudo: "Pode vir!",
    });
    lista = (await pedir("GET", "/configuracoes")).data.mensagensWhatsapp ?? [];
    expect(lista.find((m) => m.id === nova.id)).toMatchObject({
      titulo: "Troca liberada",
      conteudo: "Pode vir!",
    });

    await pedir("DELETE", `/configuracoes/whatsapp/mensagens-padrao/${nova.id}`);
    lista = (await pedir("GET", "/configuracoes")).data.mensagensWhatsapp ?? [];
    expect(lista.some((m) => m.id === nova.id)).toBe(false);
  });

  test("validação: vazio (400), longo (400), título repetido sem diferenciar maiúsculas (409), inexistente (404)", async () => {
    const url = "/configuracoes/whatsapp/mensagens-padrao";
    expect(await codigo(pedir("POST", url, { titulo: "  ", conteudo: "x" }))).toBe("400");
    expect(await codigo(pedir("POST", url, { titulo: "x", conteudo: "  " }))).toBe("400");
    expect(await codigo(pedir("POST", url, { titulo: "x".repeat(61), conteudo: "x" }))).toBe("400");
    expect(await codigo(pedir("POST", url, { titulo: "x", conteudo: "x".repeat(1001) }))).toBe(
      "400",
    );
    expect(await codigo(pedir("POST", url, { titulo: "SAUDAÇÃO", conteudo: "x" }))).toBe("409");
    expect(await codigo(pedir("PUT", `${url}/inexistente`, { titulo: "A", conteudo: "B" }))).toBe(
      "404",
    );
    expect(await codigo(pedir("DELETE", `${url}/inexistente`))).toBe("404");
  });

  test("limite de 30 mensagens (400)", async () => {
    const url = "/configuracoes/whatsapp/mensagens-padrao";
    for (let i = 6; i < 30; i++) await pedir("POST", url, { titulo: `M${i}`, conteudo: "x" });
    expect(await codigo(pedir("POST", url, { titulo: "Uma a mais", conteudo: "x" }))).toBe("400");
  }, 30_000); // a Mock API simula latência em cada requisição
});
