/**
 * Fase 22.6.1 — testes isolados de: reconciliação pela chave EXATA, persistência `em_andamento` (antes do envio),
 * recuperação após reload, isolamento/limpeza por venda e estado de restauração de estoque DA OPERAÇÃO.
 * Executar com: `bun test tests/unit`. Sem backend real: dados fictícios e `Storage` em memória.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  VERSAO_FORMATO_LEGADO,
  assinaturaDaOperacao,
  chaveDeArmazenamento,
  decidirChave,
  eventoComChave,
  lerOperacaoIncerta,
  marcarIncerta,
  mensagemDeRestauracao,
  persistirOperacao,
  reconciliarPelaChave,
  removerOperacaoIncerta,
  resumoRestauracaoDoEvento,
  type OperacaoCancelamento,
  type StatusRestauracaoOperacao,
} from "@/utils/operacao-cancelamento";
import type { CancelamentoPayload } from "@/types/venda";

class ArmazenamentoEmMemoria implements Storage {
  private dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  key(indice: number) {
    return [...this.dados.keys()][indice] ?? null;
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  setItem(chave: string, valor: string) {
    this.dados.set(chave, String(valor));
  }
}

const VENDA_A = "venda-aaaaaaaa";
const VENDA_B = "venda-bbbbbbbb";
const CHAVE = "chave-enviada-0001";
const PARCIAL: CancelamentoPayload = {
  tipo: "parcial",
  motivo: "fictício",
  itens: [{ itemId: "item-1", quantidade: 1 }],
};

const evento = (idempotencyKey: string | null, itens: unknown[] = [{ restaurado: true }]) => ({
  id: `evt-${idempotencyKey ?? "legado"}`,
  tipo: "parcial",
  idempotencyKey,
  itens,
});
const venda = (cancelamentos: unknown, id = VENDA_A) => ({ id, codigo: "VEN-1", cancelamentos });

function operacaoBase(vendaId = VENDA_A, chave = CHAVE): OperacaoCancelamento {
  return {
    vendaId,
    assinatura: assinaturaDaOperacao(PARCIAL),
    chave,
    eventos: 0,
    incerta: false,
    incertaDesde: "2026-11-12T12:00:00.000Z",
  };
}

let armazenamento: ArmazenamentoEmMemoria;
beforeEach(() => {
  armazenamento = new ArmazenamentoEmMemoria();
});

// ─── Reconciliação pela chave ──────────────────────────────────────────────────────────────────────────────────────

describe("reconciliarPelaChave", () => {
  test("10. chave EXATA presente → registrada (com o evento)", () => {
    const r = reconciliarPelaChave(VENDA_A, CHAVE, {
      ok: true,
      venda: venda([evento("outra-chave-0001"), evento(CHAVE)]),
    });
    expect(r.tipo).toBe("registrada");
    if (r.tipo === "registrada") expect(r.evento.idempotencyKey).toBe(CHAVE);
  });

  test("9. só eventos de OUTRAS chaves (inclusive parecidas, legados sem chave) → não é sucesso", () => {
    const parecidas = [`${CHAVE} `, CHAVE.toUpperCase(), CHAVE.slice(0, -1), `${CHAVE}0`, null];
    const r = reconciliarPelaChave(VENDA_A, CHAVE, {
      ok: true,
      venda: venda(parecidas.map((k) => evento(k))),
    });
    expect(r).toEqual({ tipo: "nao_encontrada" });
  });

  test("a chave decide sozinha: tipo, itens e quantidades iguais com outra chave não contam", () => {
    const r = reconciliarPelaChave(VENDA_A, CHAVE, {
      ok: true,
      venda: venda([
        { ...evento("outra-chave-0001"), itens: [{ itemId: "item-1", quantidade: 1 }] },
      ]),
    });
    expect(r.tipo).toBe("nao_encontrada");
  });

  test("7. consulta falhou → inconclusiva", () => {
    expect(reconciliarPelaChave(VENDA_A, CHAVE, { ok: false })).toEqual({
      tipo: "inconclusiva",
      motivo: "consulta_falhou",
    });
  });

  test("8. venda incompleta → inconclusiva (nunca 'não registrada')", () => {
    const incompletas: unknown[] = [
      null,
      "texto",
      [],
      { id: VENDA_A }, // sem cancelamentos
      { id: VENDA_A, cancelamentos: null },
      { id: VENDA_A, cancelamentos: "x" },
      { cancelamentos: [] }, // sem id
      { id: VENDA_A, cancelamentos: [null, 42] }, // eventos ilegíveis e chave não encontrada
    ];
    for (const v of incompletas) {
      const r = reconciliarPelaChave(VENDA_A, CHAVE, { ok: true, venda: v });
      expect(r).toEqual({ tipo: "inconclusiva", motivo: "dados_incompletos" });
    }
  });

  test("evento ilegível ao lado do evento com a chave exata → registrada (presença é prova)", () => {
    const r = reconciliarPelaChave(VENDA_A, CHAVE, {
      ok: true,
      venda: venda([null, evento(CHAVE)]),
    });
    expect(r.tipo).toBe("registrada");
  });

  test("14. venda retornada é OUTRA → inconclusiva (nada de A é decidido com dados de B)", () => {
    const r = reconciliarPelaChave(VENDA_A, CHAVE, {
      ok: true,
      venda: venda([evento(CHAVE)], VENDA_B),
    });
    expect(r).toEqual({ tipo: "inconclusiva", motivo: "venda_diferente" });
  });

  test("venda completa sem a chave → nao_encontrada (ausência só neste momento)", () => {
    expect(reconciliarPelaChave(VENDA_A, CHAVE, { ok: true, venda: venda([]) })).toEqual({
      tipo: "nao_encontrada",
    });
  });

  test("eventoComChave: atalho sobre a venda já carregada", () => {
    expect(eventoComChave(venda([evento(CHAVE)]), CHAVE)?.idempotencyKey).toBe(CHAVE);
    expect(eventoComChave(venda([evento("outra-chave-0001")]), CHAVE)).toBeNull();
    expect(eventoComChave(undefined, CHAVE)).toBeNull();
  });
});

// ─── 1–6: erro após o envio → reconciliação decide ───────────────────────────────────────────────────────────────

describe("1–6. qualquer erro após o envio: só a chave na venda relida confirma o registro", () => {
  /** Reproduz a decisão de `confirmarCancelamento` no `catch` (sem React, sem rede). */
  function aposErro(leituraDaVenda: Parameters<typeof reconciliarPelaChave>[2]) {
    const operacao = operacaoBase();
    persistirOperacao(operacao, "em_andamento", new Date(), armazenamento);
    const r = reconciliarPelaChave(VENDA_A, operacao.chave, leituraDaVenda);
    if (r.tipo === "registrada") {
      removerOperacaoIncerta(VENDA_A, armazenamento);
      return { r, pendente: null };
    }
    const incerta = marcarIncerta(operacao, new Date());
    persistirOperacao(incerta, "incerta", new Date(), armazenamento);
    return { r, pendente: incerta };
  }

  for (const status of [400, 404, 409, 500]) {
    test(`${status} após gravação (evento com a chave na venda relida) → registrada, pendência encerrada`, () => {
      const { r, pendente } = aposErro({ ok: true, venda: venda([evento(CHAVE)]) });
      expect(r.tipo).toBe("registrada");
      expect(pendente).toBeNull();
      expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("ausente");
    });
  }

  for (const status of [400, 500]) {
    test(`${status} sem evento → operação PROTEGIDA (mesma chave, persistida, sem chave nova)`, () => {
      const { r, pendente } = aposErro({ ok: true, venda: venda([evento("outra-chave-0001")]) });
      expect(r.tipo).toBe("nao_encontrada");
      expect(pendente?.incerta).toBe(true);
      const leitura = lerOperacaoIncerta(VENDA_A, armazenamento);
      if (leitura.estado !== "recuperada")
        throw new Error(`esperado recuperada: ${leitura.estado}`);
      expect(leitura.operacao.chave).toBe(CHAVE);
      // Refetch posterior com +1 evento: a mesma operação continua com a mesma chave; outra operação é bloqueada.
      const mesma = decidirChave({
        atual: pendente,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 5,
        gerarChave: () => "nao-deveria-gerar",
      });
      expect(mesma.tipo === "enviar" && mesma.operacao.chave).toBe(CHAVE);
      const outra = decidirChave({
        atual: pendente,
        vendaId: VENDA_A,
        payload: { ...PARCIAL, itens: [{ itemId: "item-2", quantidade: 1 }] },
        eventos: 5,
        gerarChave: () => "nao-deveria-gerar",
      });
      expect(outra.tipo).toBe("bloqueada");
    });
  }

  test("7. consulta de reconciliação falhou → chave preservada e persistida como incerta", () => {
    const { r, pendente } = aposErro({ ok: false });
    expect(r.tipo).toBe("inconclusiva");
    expect(pendente?.chave).toBe(CHAVE);
    const bruto = JSON.parse(armazenamento.getItem(chaveDeArmazenamento(VENDA_A)) ?? "{}");
    expect(bruto).toMatchObject({ chave: CHAVE, estado: "incerta" });
  });

  test("8. venda incompleta → chave preservada", () => {
    const { pendente } = aposErro({ ok: true, venda: { id: VENDA_A } });
    expect(pendente?.chave).toBe(CHAVE);
  });
});

// ─── 11–16: persistência antes do envio, reload, isolamento, limpeza ─────────────────────────────────────────────

describe("persistência em_andamento e recuperação", () => {
  test("11. 'em_andamento' gravado com chave, assinatura, instante e estado — e só isso", () => {
    expect(persistirOperacao(operacaoBase(), "em_andamento", new Date(), armazenamento)).toBe(true);
    const bruto = JSON.parse(armazenamento.getItem(chaveDeArmazenamento(VENDA_A)) ?? "{}");
    expect(bruto).toEqual({
      versao: 2,
      vendaId: VENDA_A,
      chave: CHAVE,
      assinatura: assinaturaDaOperacao(PARCIAL),
      iniciadaEm: "2026-11-12T12:00:00.000Z",
      estado: "em_andamento",
    });
  });

  test("12/13. reload durante 'em_andamento' → recuperada como INCERTA (chave fixada), origem em_andamento", () => {
    persistirOperacao(operacaoBase(), "em_andamento", new Date(), armazenamento);
    const leitura = lerOperacaoIncerta(VENDA_A, armazenamento);
    if (leitura.estado !== "recuperada") throw new Error("inalcançável");
    expect(leitura.origem).toBe("em_andamento");
    expect(leitura.operacao.incerta).toBe(true);
    // A recuperação em si não gera chave nem decide nada por conta própria.
    const d = decidirChave({
      atual: leitura.operacao,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 9,
      gerarChave: () => {
        throw new Error("não deveria gerar chave");
      },
    });
    expect(d.tipo === "enviar" && d.operacao.chave).toBe(CHAVE);
  });

  test("gravar v2 apaga o legado v1 da MESMA venda (e só dela)", () => {
    const legado = (vendaId: string) =>
      JSON.stringify({
        versao: 1,
        vendaId,
        chave: CHAVE,
        assinatura: assinaturaDaOperacao(PARCIAL),
        incertaDesde: "2026-11-12T12:00:00.000Z",
      });
    armazenamento.setItem(chaveDeArmazenamento(VENDA_A, VERSAO_FORMATO_LEGADO), legado(VENDA_A));
    armazenamento.setItem(chaveDeArmazenamento(VENDA_B, VERSAO_FORMATO_LEGADO), legado(VENDA_B));
    persistirOperacao(operacaoBase(), "em_andamento", new Date(), armazenamento);
    expect(armazenamento.getItem(chaveDeArmazenamento(VENDA_A, VERSAO_FORMATO_LEGADO))).toBeNull();
    expect(
      armazenamento.getItem(chaveDeArmazenamento(VENDA_B, VERSAO_FORMATO_LEGADO)),
    ).not.toBeNull();
  });

  test("14. venda A não recupera o registro da venda B", () => {
    persistirOperacao(operacaoBase(VENDA_B), "em_andamento", new Date(), armazenamento);
    expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("ausente");
  });

  test("15/16. encerrar (sucesso normal ou por reconciliação) remove v2 e v1 só da venda atual", () => {
    persistirOperacao(operacaoBase(VENDA_A), "incerta", new Date(), armazenamento);
    persistirOperacao(
      operacaoBase(VENDA_B, "chave-da-b-0001"),
      "em_andamento",
      new Date(),
      armazenamento,
    );
    armazenamento.setItem("outra.chave.qualquer", "intocada");
    expect(removerOperacaoIncerta(VENDA_A, armazenamento)).toBe(true);
    expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("ausente");
    expect(lerOperacaoIncerta(VENDA_B, armazenamento).estado).toBe("recuperada");
    expect(armazenamento.getItem("outra.chave.qualquer")).toBe("intocada");
  });

  test("19. armazenamento indisponível: persistir retorna false sem lançar", () => {
    expect(persistirOperacao(operacaoBase(), "em_andamento", new Date(), null)).toBe(false);
  });
});

// ─── 20–22: restauração de estoque da OPERAÇÃO ──────────────────────────────────────────────────────────────────

describe("restauração de estoque da operação", () => {
  const linha = (dados: Record<string, unknown>) => ({ itemId: "item-1", quantidade: 1, ...dados });

  test("21. cada estado do contrato real é representado", () => {
    const casos: [unknown[], StatusRestauracaoOperacao][] = [
      [[], "nao_aplicavel"],
      [[linha({ restaurado: true, estadoRestauracao: "concluida" })], "concluida"],
      [[linha({ restaurado: true })], "concluida"], // evento antigo: `restaurado` basta
      [[linha({ restaurado: false, estadoRestauracao: "pendente" })], "pendente"],
      [[linha({ restaurado: false, estadoRestauracao: "falha_recuperavel" })], "falha_recuperavel"],
      [
        [linha({ restaurado: false, estadoRestauracao: "requer_intervencao" })],
        "requer_intervencao",
      ],
      [[linha({ restaurado: false })], "indeterminado"], // sem estado: sem prova
      [[linha({})], "indeterminado"],
      [[linha({ restaurado: false, estadoRestauracao: "concluida" })], "indeterminado"], // contraditório
      [[linha({ restaurado: false, estadoRestauracao: "desconhecido" })], "indeterminado"],
    ];
    for (const [itens, esperado] of casos) {
      expect(resumoRestauracaoDoEvento({ idempotencyKey: CHAVE, itens }).status).toBe(esperado);
    }
  });

  test("precedência: requer_intervencao > indeterminado > falha_recuperavel > pendente > concluida", () => {
    const status = (...estados: Record<string, unknown>[]) =>
      resumoRestauracaoDoEvento({ itens: estados.map(linha) }).status;
    expect(status({ restaurado: true }, { estadoRestauracao: "pendente" })).toBe("pendente");
    expect(
      status({ estadoRestauracao: "pendente" }, { estadoRestauracao: "falha_recuperavel" }),
    ).toBe("falha_recuperavel");
    expect(status({ estadoRestauracao: "falha_recuperavel" }, {})).toBe("indeterminado");
    expect(status({}, { estadoRestauracao: "requer_intervencao" })).toBe("requer_intervencao");
  });

  test("evento ausente ou sem linhas legíveis → indeterminado (nunca sucesso)", () => {
    expect(resumoRestauracaoDoEvento(null).status).toBe("indeterminado");
    expect(resumoRestauracaoDoEvento({ itens: "x" }).status).toBe("indeterminado");
  });

  test("20. 'indeterminado' nunca é apresentado como sucesso; só concluida/nao_aplicavel são", () => {
    const tons = Object.fromEntries(
      (
        [
          "nao_aplicavel",
          "concluida",
          "pendente",
          "falha_recuperavel",
          "requer_intervencao",
          "indeterminado",
        ] as const
      ).map((s) => [s, mensagemDeRestauracao(s)]),
    );
    expect(tons["concluida"]).toEqual({ tom: "sucesso", texto: null });
    expect(tons["nao_aplicavel"]).toEqual({ tom: "sucesso", texto: null });
    for (const s of ["pendente", "falha_recuperavel", "requer_intervencao", "indeterminado"]) {
      expect(tons[s]?.tom).toBe("aviso");
      expect(tons[s]?.texto).toBeTruthy();
    }
    expect(tons["indeterminado"]?.texto).toContain("não foi possível determinar");
    // Nenhuma afirmação de estoque devolvido sem a dúvida explícita.
    expect(tons["indeterminado"]?.texto).toMatch(/se o estoque desta operação foi devolvido/);
    expect(tons["indeterminado"]?.texto).not.toMatch(/^(o )?estoque (foi )?devolvido/i);
  });

  test("22. o resumo considera SÓ a operação atual: linhas antigas não contaminam, pendência nova não some", () => {
    const vendaComHistorico = venda([
      evento("chave-antiga-0001", [linha({ restaurado: false })]), // antiga indeterminada
      evento("chave-antiga-0002", [linha({ estadoRestauracao: "requer_intervencao" })]),
      evento(CHAVE, [linha({ restaurado: false, estadoRestauracao: "pendente" })]), // a atual
    ]);
    expect(resumoRestauracaoDoEvento(eventoComChave(vendaComHistorico, CHAVE)).status).toBe(
      "pendente",
    );

    const atualConcluida = venda([
      evento("chave-antiga-0001", [linha({ restaurado: false })]),
      evento(CHAVE, [linha({ restaurado: true, estadoRestauracao: "concluida" })]),
    ]);
    expect(resumoRestauracaoDoEvento(eventoComChave(atualConcluida, CHAVE)).status).toBe(
      "concluida",
    );
  });
});
