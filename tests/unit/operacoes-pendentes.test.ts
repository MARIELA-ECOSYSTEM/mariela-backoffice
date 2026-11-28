/**
 * Fase 2 — correções operacionais essenciais. Executar com: `bun test tests/unit`.
 *
 * - `utils/operacao-pendente.ts`: UMA `idempotencyKey` por operação (estoque, caixa, recebimento, baixa de parcela),
 *   reusada em toda nova tentativa depois de um resultado incerto (timeout, rede, 502/503/504); chave nova só para uma
 *   operação nova (depois de sucesso, erro definitivo ou descarte explícito).
 * - Fluxo completo contra um "servidor" simulado que deduplica pela chave (como o backend real): timeout depois de
 *   gravar + nova tentativa = UM registro.
 * - Mock API do estoque (espelho do backend): replay pela chave; chave reusada em outra movimentação → 409.
 * - Recebimento na Mock API: a mesma chave não registra dois recebimentos.
 * - Caixa: dinheiro da gaveta (`gavetaDoResumo`) e forma padrão "Dinheiro" (`formaPadraoDaGaveta`).
 * Tudo sintético e em memória; nenhuma rede.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { ApiError } from "@/types/api";
import {
  concluirOperacao,
  contextoOperacao,
  descartarOperacao,
  iniciarOperacao,
  limparOperacoesPendentes,
  operacaoPendente,
} from "@/utils/operacao-pendente";
import { formaPadraoDaGaveta, gavetaDoResumo } from "@/utils/caixa";
import { handleMockRequest } from "@/services/mock/mock-transport";
import { db } from "@/services/mock/db";
import type { ResumoCaixa } from "@/types/caixa";
import type { Produto } from "@/types/produto";
import type { VendaDetalhe } from "@/types/venda";

const TIMEOUT = new ApiError({ statusCode: 408, code: "TIMEOUT", message: "tempo limite" });
const REDE = new ApiError({ statusCode: 0, code: "NETWORK_ERROR", message: "rede" });
const gateway = (status: number) =>
  new ApiError({ statusCode: status, code: "HTTP_ERROR", message: "gateway" });
const definitivo = (status: number) =>
  new ApiError({ statusCode: status, code: "VALIDATION_ERROR", message: "recusado" });

let sequencia = 0;
const gerar = () => `chave-${++sequencia}`;
const CTX = contextoOperacao.estoque("entrada", "p1", "v1");

beforeEach(() => {
  limparOperacoesPendentes();
  sequencia = 0;
});

describe("operação pendente — uma chave por operação", () => {
  test("primeiro envio cria a operação com chave nova; enquanto está em andamento, não há segundo envio", () => {
    const op = iniciarOperacao(CTX, { quantidade: 3 }, gerar);
    expect(op).toMatchObject({
      chave: "chave-1",
      payload: { quantidade: 3 },
      estado: "em_andamento",
    });
    expect(iniciarOperacao(CTX, { quantidade: 3 }, gerar)).toBeNull(); // duplo clique
  });

  for (const [nome, erro] of [
    ["timeout", TIMEOUT],
    ["falha de rede", REDE],
    ["502", gateway(502)],
    ["503", gateway(503)],
    ["504", gateway(504)],
  ] as const) {
    test(`${nome}: a operação fica INCERTA e a nova tentativa usa a MESMA chave e o MESMO payload`, () => {
      iniciarOperacao(CTX, { quantidade: 3 }, gerar);
      expect(concluirOperacao(CTX, erro)).toBe("incerta");
      expect(operacaoPendente(CTX)?.estado).toBe("incerta");
      // Mesmo que a tela tente enviar outros dados, a operação incerta é reenviada como era.
      const retentativa = iniciarOperacao(CTX, { quantidade: 99 }, gerar);
      expect(retentativa).toMatchObject({ chave: "chave-1", payload: { quantidade: 3 } });
      expect(sequencia).toBe(1); // nenhuma chave nova gerada
    });
  }

  test("várias tentativas incertas seguidas mantêm a chave até a confirmação", () => {
    iniciarOperacao(CTX, { quantidade: 3 }, gerar);
    for (let i = 0; i < 3; i += 1) {
      concluirOperacao(CTX, TIMEOUT);
      expect(iniciarOperacao(CTX, { quantidade: 3 }, gerar)?.chave).toBe("chave-1");
    }
    expect(concluirOperacao(CTX)).toBe("concluida");
    expect(operacaoPendente(CTX)).toBeNull();
  });

  test("depois da confirmação, uma segunda operação legítima recebe chave NOVA", () => {
    iniciarOperacao(CTX, { quantidade: 3 }, gerar);
    concluirOperacao(CTX);
    expect(iniciarOperacao(CTX, { quantidade: 3 }, gerar)?.chave).toBe("chave-2");
  });

  for (const status of [400, 404, 409, 422, 500]) {
    test(`erro definitivo ${status}: nada foi registrado — a próxima tentativa é uma operação nova`, () => {
      iniciarOperacao(CTX, { quantidade: 3 }, gerar);
      expect(concluirOperacao(CTX, definitivo(status))).toBe("rejeitada");
      expect(operacaoPendente(CTX)).toBeNull();
      expect(iniciarOperacao(CTX, { quantidade: 2 }, gerar)).toMatchObject({
        chave: "chave-2",
        payload: { quantidade: 2 },
      });
    });
  }

  test("descartar uma operação incerta libera o contexto; um envio em andamento não é descartado", () => {
    iniciarOperacao(CTX, { quantidade: 3 }, gerar);
    descartarOperacao(CTX); // em andamento: ignorado
    expect(operacaoPendente(CTX)?.estado).toBe("em_andamento");
    concluirOperacao(CTX, TIMEOUT);
    descartarOperacao(CTX);
    expect(operacaoPendente(CTX)).toBeNull();
    expect(iniciarOperacao(CTX, { quantidade: 1 }, gerar)?.chave).toBe("chave-2");
  });

  test("contextos independentes: entrada × saída, variantes, caixas, recebimento × parcelas", () => {
    const contextos = [
      contextoOperacao.estoque("entrada", "p1", "v1"),
      contextoOperacao.estoque("saida", "p1", "v1"),
      contextoOperacao.estoque("entrada", "p1", "v2"),
      contextoOperacao.caixa("entrada", "c1"),
      contextoOperacao.caixa("saida", "c1"),
      contextoOperacao.caixa("saida", "c2"),
      contextoOperacao.recebimento("venda1"),
      contextoOperacao.baixaParcela("venda1", "parc1"),
      contextoOperacao.baixaParcela("venda1", "parc2"),
    ];
    expect(new Set(contextos).size).toBe(contextos.length);
    iniciarOperacao(contextos[0]!, {}, gerar);
    concluirOperacao(contextos[0]!, TIMEOUT);
    // Uma operação incerta num contexto não bloqueia nem contamina os outros.
    expect(iniciarOperacao(contextos[1]!, {}, gerar)?.chave).toBe("chave-2");
  });
});

/**
 * "Servidor" que deduplica pela chave, como o backend (estoque: assinatura; caixa: índice único; recebimento: chave no
 * pagamento). `falharDepoisDeGravar` simula a resposta perdida: grava e devolve timeout.
 */
function servidorSimulado() {
  const registros = new Map<string, number>();
  let falharDepoisDeGravar = 0;
  return {
    registros,
    perderProximasRespostas(n: number) {
      falharDepoisDeGravar = n;
    },
    async enviar(chave: string, valor: number): Promise<void> {
      if (!registros.has(chave)) registros.set(chave, valor);
      if (falharDepoisDeGravar > 0) {
        falharDepoisDeGravar -= 1;
        throw TIMEOUT;
      }
    },
  };
}

async function enviarComOperacao(
  contexto: string,
  valor: number,
  servidor: ReturnType<typeof servidorSimulado>,
): Promise<"concluida" | "incerta" | "rejeitada" | "bloqueada"> {
  const op = iniciarOperacao(contexto, { valor });
  if (!op) return "bloqueada";
  try {
    await servidor.enviar(op.chave, op.payload.valor);
    return concluirOperacao(contexto);
  } catch (erro) {
    return concluirOperacao(contexto, erro);
  }
}

describe("fluxo com timeout e repetição (servidor simulado)", () => {
  for (const [nome, contexto] of [
    ["entrada de estoque", contextoOperacao.estoque("entrada", "p1", "v1")],
    ["saída de caixa (sangria)", contextoOperacao.caixa("saida", "c1")],
    ["recebimento", contextoOperacao.recebimento("venda1")],
    ["baixa de parcela", contextoOperacao.baixaParcela("venda1", "parc1")],
  ] as const) {
    test(`${nome}: resposta perdida + nova tentativa = UM registro; nova operação = segundo registro`, async () => {
      const servidor = servidorSimulado();
      servidor.perderProximasRespostas(2);
      expect(await enviarComOperacao(contexto, 50, servidor)).toBe("incerta");
      expect(await enviarComOperacao(contexto, 50, servidor)).toBe("incerta");
      expect(await enviarComOperacao(contexto, 50, servidor)).toBe("concluida");
      expect(servidor.registros.size).toBe(1);

      // Uma segunda operação legítima, depois da confirmação, é registrada (chave nova).
      expect(await enviarComOperacao(contexto, 50, servidor)).toBe("concluida");
      expect(servidor.registros.size).toBe(2);
    });
  }

  test("sem a correção (chave nova a cada clique) o mesmo cenário registraria duas vezes", async () => {
    const servidor = servidorSimulado();
    servidor.perderProximasRespostas(1);
    await servidor.enviar("clique-1", 50).catch(() => undefined);
    await servidor.enviar("clique-2", 50);
    expect(servidor.registros.size).toBe(2); // o comportamento antigo que a Fase 2 elimina
  });
});

describe("Mock API do estoque — idempotência espelhando o backend", () => {
  const TOKEN = "token-teste";
  const enviar = (rota: "entrada" | "saida", body: Record<string, unknown>) =>
    handleMockRequest<Produto>({
      method: "POST",
      path: `/estoque/${rota}`,
      params: {},
      body,
      token: TOKEN,
    });

  function primeiroTamanho() {
    for (const produto of db.produtos) {
      for (const variante of produto.variantes) {
        const tamanho = variante.tamanhos[0];
        if (tamanho) return { produto, variante, tamanho };
      }
    }
    throw new Error("seed sem tamanho");
  }

  test("entrada repetida com a mesma chave soma UMA vez; chave nova soma de novo", async () => {
    const { produto, variante, tamanho } = primeiroTamanho();
    const antes = tamanho.quantidade;
    const base = {
      produtoId: produto.id,
      varianteId: variante.id,
      tamanhoId: tamanho.id,
      quantidade: 2,
    };
    await enviar("entrada", { ...base, idempotencyKey: "estoque-e-1" });
    await enviar("entrada", { ...base, idempotencyKey: "estoque-e-1" });
    expect(tamanho.quantidade).toBe(antes + 2);
    await enviar("entrada", { ...base, idempotencyKey: "estoque-e-2" });
    expect(tamanho.quantidade).toBe(antes + 4);
  });

  test("saída repetida com a mesma chave baixa UMA vez", async () => {
    const { produto, variante, tamanho } = primeiroTamanho();
    tamanho.quantidade = 10;
    const base = {
      produtoId: produto.id,
      varianteId: variante.id,
      tamanhoId: tamanho.id,
      quantidade: 3,
      motivo: "Avaria",
    };
    await enviar("saida", { ...base, idempotencyKey: "estoque-s-1" });
    await enviar("saida", { ...base, idempotencyKey: "estoque-s-1" });
    expect(tamanho.quantidade).toBe(7);
  });

  test("a mesma chave numa movimentação diferente é recusada (409), sem movimentar", async () => {
    const { produto, variante, tamanho } = primeiroTamanho();
    const base = { produtoId: produto.id, varianteId: variante.id, tamanhoId: tamanho.id };
    await enviar("entrada", { ...base, quantidade: 1, idempotencyKey: "estoque-x" });
    const depois = tamanho.quantidade;
    const erro = await enviar("entrada", {
      ...base,
      quantidade: 5,
      idempotencyKey: "estoque-x",
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).statusCode).toBe(409);
    expect(tamanho.quantidade).toBe(depois);
  });
});

describe("Mock API — recebimento repetido com a mesma chave", () => {
  test("a mesma chave não registra dois recebimentos; chave nova registra", async () => {
    // Garante a pré-condição do mock (caixa aberto), sem depender da ordem dos outros testes.
    const lista = await handleMockRequest<VendaDetalhe[]>({
      method: "GET",
      path: "/vendas",
      params: {},
      body: undefined,
      token: "t",
    });
    const alvo = lista.data.find((v) => v.status === "em_pagamento" && v.valorPendente >= 2);
    if (!alvo) throw new Error("seed sem venda em pagamento");
    const receber = (chave: string) =>
      handleMockRequest<VendaDetalhe>({
        method: "POST",
        path: `/vendas/${alvo.id}/recebimentos`,
        params: {},
        body: { forma: "Dinheiro", valor: 1, idempotencyKey: chave },
        token: "t",
      });
    const primeira = await receber("receb-1");
    const repetida = await receber("receb-1");
    expect(repetida.data.valorPago).toBe(primeira.data.valorPago);
    const nova = await receber("receb-2");
    expect(nova.data.valorPago).toBeCloseTo(primeira.data.valorPago + 1, 2);
  });
});

describe("caixa — dinheiro da gaveta e forma padrão", () => {
  const resumoBase = {
    valorAbertura: 100,
    saldoEsperado: 594,
  } as ResumoCaixa;

  test("com `dinheiroEsperado` do servidor, a gaveta mostra o dinheiro físico, não a soma de todas as formas", () => {
    expect(gavetaDoResumo({ ...resumoBase, dinheiroEsperado: 200 })).toEqual({
      valor: 200,
      rotulo: "Dinheiro esperado na gaveta",
    });
  });

  test("dinheiro esperado negativo (sangria maior que o dinheiro) é mostrado como está", () => {
    expect(gavetaDoResumo({ ...resumoBase, dinheiroEsperado: -30 }).valor).toBe(-30);
  });

  test("servidor anterior (sem `dinheiroEsperado`): saldo com o rótulo antigo", () => {
    expect(gavetaDoResumo(resumoBase)).toEqual({ valor: 594, rotulo: "Saldo esperado" });
  });

  test("forma padrão da movimentação física é Dinheiro, em qualquer posição e grafia", () => {
    expect(formaPadraoDaGaveta(["PIX", "Crédito", "Dinheiro", "Débito"])).toBe("Dinheiro");
    expect(formaPadraoDaGaveta(["PIX", " DINHEIRO "])).toBe(" DINHEIRO ");
    expect(formaPadraoDaGaveta(["Crédito", "dinhêiro"])).toBe("dinhêiro");
  });

  test("sem Dinheiro cadastrado, cai na primeira forma; lista vazia → Dinheiro", () => {
    expect(formaPadraoDaGaveta(["PIX", "Crédito"])).toBe("PIX");
    expect(formaPadraoDaGaveta([])).toBe("Dinheiro");
  });
});
