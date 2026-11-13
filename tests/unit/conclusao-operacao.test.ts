/**
 * Fase 22.6.3 — evento registrado ≠ operação concluída. Testa a leitura do indicador `efeitosPosteriores` por
 * operação (chave exata) e a repetição segura da operação pendente. Executar com: `bun test tests/unit`.
 * Sem backend real: dados fictícios.
 */
import { describe, expect, test } from "bun:test";
import {
  assinaturaDaOperacao,
  avaliarConclusao,
  avaliarOperacaoPelaChave,
  decidirChave,
  encerraOperacao,
  marcarIncerta,
  payloadDaOperacaoPendente,
  type ConclusaoDaOperacao,
  type OperacaoCancelamento,
} from "@/utils/operacao-cancelamento";
import type { CancelamentoPayload } from "@/types/venda";

const VENDA = "venda-aaaaaaaa";
const CHAVE = "chave-enviada-0001";
const PARCIAL: CancelamentoPayload = {
  tipo: "parcial",
  motivo: "fictício",
  itens: [
    { itemId: "item-2", quantidade: 1 },
    { itemId: "item-1", quantidade: 2 },
  ],
};

const evento = (idempotencyKey: string | null, efeitosPosteriores?: unknown) => ({
  id: `evt-${idempotencyKey ?? "sem-chave"}`,
  tipo: "parcial",
  idempotencyKey,
  itens: [{ restaurado: true }],
  ...(efeitosPosteriores === undefined ? {} : { efeitosPosteriores }),
});
const lida = (cancelamentos: unknown[], id = VENDA) => ({
  ok: true as const,
  venda: { id, cancelamentos },
});

describe("avaliarOperacaoPelaChave", () => {
  test("1. evento com a chave e `concluidos` → concluída (encerra)", () => {
    const r = avaliarOperacaoPelaChave(VENDA, CHAVE, lida([evento(CHAVE, "concluidos")]));
    expect(r.tipo).toBe("concluida");
    expect(encerraOperacao(r)).toBe(true);
  });

  test("2. evento com a chave e `pendentes` → efeitos pendentes (NÃO encerra)", () => {
    const r = avaliarOperacaoPelaChave(VENDA, CHAVE, lida([evento(CHAVE, "pendentes")]));
    expect(r.tipo).toBe("efeitos_pendentes");
    expect(encerraOperacao(r)).toBe(false);
  });

  test("3. evento concluído com chave DIFERENTE não é sucesso desta operação", () => {
    const r = avaliarOperacaoPelaChave(
      VENDA,
      CHAVE,
      lida([evento("outra-chave-9999", "concluidos")]),
    );
    expect(r).toEqual({ tipo: "nao_encontrada" });
    expect(encerraOperacao(r)).toBe(false);
    // Prefixo/sufixo da chave também não serve.
    const prefixo = avaliarOperacaoPelaChave(
      VENDA,
      CHAVE,
      lida([evento(`${CHAVE}-x`, "concluidos")]),
    );
    expect(prefixo.tipo).toBe("nao_encontrada");
  });

  test("4. consulta falhou / venda incompleta / outra venda → inconclusiva (mantém proteção)", () => {
    const casos: ConclusaoDaOperacao[] = [
      avaliarOperacaoPelaChave(VENDA, CHAVE, { ok: false }),
      avaliarOperacaoPelaChave(VENDA, CHAVE, { ok: true, venda: { id: VENDA } }),
      avaliarOperacaoPelaChave(VENDA, CHAVE, lida([evento(CHAVE, "concluidos")], "outra-venda")),
    ];
    expect(casos.map((c) => (c.tipo === "inconclusiva" ? c.motivo : c.tipo))).toEqual([
      "consulta_falhou",
      "dados_incompletos",
      "venda_diferente",
    ]);
    for (const c of casos) expect(encerraOperacao(c)).toBe(false);
  });

  test("5. evento SEM o indicador (backend anterior à 22.6.3) ou com valor desconhecido → inconclusiva, nunca concluída", () => {
    for (const valor of [undefined, null, "", "concluido", "CONCLUIDOS", true, 1]) {
      const r = avaliarOperacaoPelaChave(VENDA, CHAVE, lida([evento(CHAVE, valor)]));
      expect(r.tipo).toBe("inconclusiva");
      if (r.tipo === "inconclusiva") {
        expect(r.motivo).toBe("indicador_ausente");
        expect(r.evento?.idempotencyKey).toBe(CHAVE); // o evento existe — não é falha
      }
      expect(encerraOperacao(r)).toBe(false);
    }
  });

  test("5b. evento legado com `nao_rastreados` → compatibilidade explícita: registrada sem rastreio (encerra com aviso)", () => {
    const r = avaliarOperacaoPelaChave(VENDA, CHAVE, lida([evento(CHAVE, "nao_rastreados")]));
    expect(r.tipo).toBe("registrada_sem_rastreio");
    expect(encerraOperacao(r)).toBe(true);
  });

  test("a decisão usa SÓ o evento da chave: outro evento pendente na mesma venda não afeta uma operação concluída", () => {
    const r = avaliarOperacaoPelaChave(
      VENDA,
      CHAVE,
      lida([evento("anterior-0001", "pendentes"), evento(CHAVE, "concluidos")]),
    );
    expect(r.tipo).toBe("concluida");
  });

  test("avaliarConclusao repassa nao_encontrada/inconclusiva sem alterar", () => {
    expect(avaliarConclusao({ tipo: "nao_encontrada" })).toEqual({ tipo: "nao_encontrada" });
    expect(avaliarConclusao({ tipo: "inconclusiva", motivo: "consulta_falhou" })).toEqual({
      tipo: "inconclusiva",
      motivo: "consulta_falhou",
    });
  });
});

describe("repetição da operação pendente", () => {
  const operacaoPendente = (): OperacaoCancelamento =>
    marcarIncerta(
      {
        vendaId: VENDA,
        assinatura: assinaturaDaOperacao(PARCIAL),
        chave: CHAVE,
        eventos: 0,
        incerta: false,
        incertaDesde: null,
      },
      new Date("2026-11-13T12:00:00.000Z"),
    );

  test("7. o payload reconstruído tem a MESMA assinatura e reutiliza a chave original (sem gerar nova)", () => {
    const pendente = operacaoPendente();
    const payload = payloadDaOperacaoPendente(pendente.assinatura, "outro motivo qualquer");
    expect(payload).not.toBeNull();
    expect(assinaturaDaOperacao(payload!)).toBe(pendente.assinatura);
    let gerou = 0;
    const decisao = decidirChave({
      atual: pendente,
      vendaId: VENDA,
      payload: payload!,
      eventos: 5, // o nº de eventos mudou (o evento já existe): irrelevante para a operação pendente
      gerarChave: () => {
        gerou += 1;
        return "chave-nova-nao-deveria";
      },
    });
    expect(decisao.tipo).toBe("enviar");
    if (decisao.tipo === "enviar") expect(decisao.operacao.chave).toBe(CHAVE);
    expect(gerou).toBe(0);
  });

  test("integral reconstrói só o tipo; assinatura ilegível → null (nada é inventado)", () => {
    const integral = assinaturaDaOperacao({ tipo: "integral" });
    expect(payloadDaOperacaoPendente(integral, "m")).toEqual({ tipo: "integral", motivo: "m" });
    expect(payloadDaOperacaoPendente("{lixo", "m")).toBeNull();
    expect(
      payloadDaOperacaoPendente(JSON.stringify({ tipo: "parcial", itens: [] }), "m"),
    ).toBeNull();
  });

  test("operação DIFERENTE enquanto a pendente existe continua bloqueada (não vira nova devolução)", () => {
    const decisao = decidirChave({
      atual: operacaoPendente(),
      vendaId: VENDA,
      payload: { tipo: "integral", motivo: "x" },
      eventos: 1,
      gerarChave: () => "chave-nova",
    });
    expect(decisao.tipo).toBe("bloqueada");
  });
});
