/**
 * Fase 22.5.2 — testes isolados do ciclo de vida da `idempotencyKey` de cancelamento/devolução.
 * Executar com: `bun test tests/unit`
 *
 * Sem backend real: o armazenamento é um `Storage` em memória e `fetch` é monitorado para provar que nada é enviado.
 * Fica fora de `src/` porque o `tsconfig` do app não inclui os tipos de `bun:test`.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiError } from "@/types/api";
import {
  PREFIXO_ARMAZENAMENTO,
  VERSAO_FORMATO,
  assinaturaDaOperacao,
  chaveDeArmazenamento,
  decidirChave,
  ehResultadoIncerto,
  lerOperacaoIncerta,
  marcarIncerta,
  persistirOperacaoIncerta,
  removerOperacaoIncerta,
  type OperacaoCancelamento,
} from "@/utils/operacao-cancelamento";
import type { CancelamentoPayload } from "@/types/venda";

// ─── Utilitários de teste ──────────────────────────────────────────────────────────────────────────────────────────

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

/** Simula `sessionStorage` bloqueado/sem cota: todo acesso lança. */
class ArmazenamentoQueFalha implements Storage {
  length = 0;
  clear(): void {
    throw new DOMException("bloqueado", "SecurityError");
  }
  getItem(): string | null {
    throw new DOMException("bloqueado", "SecurityError");
  }
  key(): string | null {
    throw new DOMException("bloqueado", "SecurityError");
  }
  removeItem(): void {
    throw new DOMException("bloqueado", "SecurityError");
  }
  setItem(): void {
    throw new DOMException("cota", "QuotaExceededError");
  }
}

function geradorDeChaves() {
  let n = 0;
  const gerar = mock(() => `chave-${String(++n).padStart(4, "0")}-aaaa`);
  return gerar;
}

const VENDA_A = "venda-aaaaaaaa";
const VENDA_B = "venda-bbbbbbbb";
const PARCIAL: CancelamentoPayload = {
  tipo: "parcial",
  motivo: "cliente desistiu",
  itens: [
    { itemId: "item-2", quantidade: 1 },
    { itemId: "item-1", quantidade: 2 },
  ],
};
const INTEGRAL: CancelamentoPayload = { tipo: "integral", motivo: "erro de lançamento" };

const erroTimeout = () =>
  new ApiError({
    statusCode: 408,
    code: "TIMEOUT",
    message: "A requisição excedeu o tempo limite.",
  });
const erroRede = () =>
  new ApiError({
    statusCode: 0,
    code: "NETWORK_ERROR",
    message: "Falha de conexão com o servidor.",
  });
/** Como `client.ts` representa uma resposta não-ok com corpo não-JSON (página HTML do gateway). */
const erroHttp = (status: number, code = "HTTP_ERROR") =>
  new ApiError({ statusCode: status, code, message: "Não foi possível completar a requisição." });

/**
 * Reproduz, sem React, o fluxo de `confirmarCancelamento`: decide a chave, "envia" (registra a chave usada) e, se o
 * erro for incerto, marca + persiste. Nada é enviado de verdade.
 */
function tentar(parametros: {
  atual: OperacaoCancelamento | null;
  vendaId: string;
  payload: CancelamentoPayload;
  eventos: number;
  gerarChave: () => string;
  armazenamento: Storage | null;
  erro: unknown | null;
}) {
  const decisao = decidirChave(parametros);
  if (decisao.tipo === "bloqueada") return { decisao, chaveEnviada: null, atual: parametros.atual };
  const operacao = decisao.operacao;
  if (parametros.erro === null) {
    removerOperacaoIncerta(operacao.vendaId, parametros.armazenamento);
    return { decisao, chaveEnviada: operacao.chave, atual: null };
  }
  if (ehResultadoIncerto(parametros.erro)) {
    const incerta = marcarIncerta(operacao, new Date("2026-11-12T12:00:00.000Z"));
    persistirOperacaoIncerta(incerta, parametros.armazenamento);
    return { decisao, chaveEnviada: operacao.chave, atual: incerta };
  }
  return { decisao, chaveEnviada: operacao.chave, atual: operacao };
}

let armazenamento: ArmazenamentoEmMemoria;
const fetchOriginal = globalThis.fetch;
const fetchMonitorado = mock(() => Promise.reject(new Error("fetch não deveria ser chamado")));

beforeEach(() => {
  armazenamento = new ArmazenamentoEmMemoria();
  fetchMonitorado.mockClear();
  globalThis.fetch = fetchMonitorado as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

// ─── 1–5 + 6 + 8: persistência após cada erro incerto e reload sem chave nova ─────────────────────────────────────

describe("erros incertos persistem a operação e o reload recupera a MESMA chave", () => {
  const casos: [string, () => ApiError][] = [
    ["1. TIMEOUT", erroTimeout],
    ["2. NETWORK_ERROR", erroRede],
    ["3. HTTP 502", () => erroHttp(502)],
    ["4. HTTP 503", () => erroHttp(503)],
    ["5. HTTP 504", () => erroHttp(504)],
  ];

  for (const [nome, criarErro] of casos) {
    test(`${nome} → persiste; reload + refetch (eventos+1) → mesma chave, sem gerar outra`, () => {
      const gerarChave = geradorDeChaves();
      const primeira = tentar({
        atual: null,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
        armazenamento,
        erro: criarErro(),
      });
      expect(primeira.chaveEnviada).toBe("chave-0001-aaaa");
      expect(armazenamento.getItem(chaveDeArmazenamento(VENDA_A))).not.toBeNull();

      // "Reload": a memória some; só resta o sessionStorage.
      const leitura = lerOperacaoIncerta(VENDA_A, armazenamento);
      expect(leitura.estado).toBe("recuperada");
      if (leitura.estado !== "recuperada") throw new Error("inalcançável");
      expect(leitura.operacao.chave).toBe("chave-0001-aaaa");
      expect(leitura.operacao.incerta).toBe(true);

      // O backend TINHA registrado: o refetch trouxe um evento a mais. Reenvio da mesma operação.
      const reenvio = tentar({
        atual: leitura.operacao,
        vendaId: VENDA_A,
        payload: { ...PARCIAL, motivo: "outro texto de motivo" },
        eventos: 1,
        gerarChave,
        armazenamento,
        erro: null,
      });
      expect(reenvio.chaveEnviada).toBe("chave-0001-aaaa");
      expect(gerarChave).toHaveBeenCalledTimes(1);
    });
  }

  test("6. remontagem repetida (vários reloads) mantém a chave e o instante original", () => {
    const gerarChave = geradorDeChaves();
    let r = tentar({
      atual: null,
      vendaId: VENDA_A,
      payload: INTEGRAL,
      eventos: 0,
      gerarChave,
      armazenamento,
      erro: erroTimeout(),
    });
    const desde = r.atual?.incertaDesde;
    for (let i = 0; i < 3; i++) {
      const leitura = lerOperacaoIncerta(VENDA_A, armazenamento);
      if (leitura.estado !== "recuperada")
        throw new Error(`esperado recuperada, veio ${leitura.estado}`);
      r = tentar({
        atual: leitura.operacao,
        vendaId: VENDA_A,
        payload: INTEGRAL,
        eventos: i + 5,
        gerarChave,
        armazenamento,
        erro: erroHttp(504),
      });
      expect(r.chaveEnviada).toBe("chave-0001-aaaa");
      expect(r.atual?.incertaDesde).toBe(desde);
    }
    expect(gerarChave).toHaveBeenCalledTimes(1);
  });
});

// ─── 7, 8, 15, 18: regras de decisão da chave ─────────────────────────────────────────────────────────────────────

describe("decisão da chave", () => {
  test("7. mesma assinatura reusa a chave (ordem dos itens e motivo não importam)", () => {
    const gerarChave = geradorDeChaves();
    const a = decidirChave({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 2,
      gerarChave,
    });
    if (a.tipo !== "enviar") throw new Error("inalcançável");
    const b = decidirChave({
      atual: a.operacao,
      vendaId: VENDA_A,
      payload: {
        tipo: "parcial",
        motivo: "motivo diferente",
        itens: [
          { itemId: "item-1", quantidade: 2 },
          { itemId: "item-2", quantidade: 1 },
        ],
      },
      eventos: 2,
      gerarChave,
    });
    expect(b.tipo).toBe("enviar");
    if (b.tipo !== "enviar") throw new Error("inalcançável");
    expect(b.operacao.chave).toBe(a.operacao.chave);
    expect(gerarChave).toHaveBeenCalledTimes(1);
  });

  test("8. operação incerta: nenhuma chave nova é gerada mesmo com o nº de eventos mudando", () => {
    const gerarChave = geradorDeChaves();
    const a = decidirChave({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 0,
      gerarChave,
    });
    if (a.tipo !== "enviar") throw new Error("inalcançável");
    const incerta = marcarIncerta(a.operacao, new Date());
    for (const eventos of [0, 1, 2, 10]) {
      const d = decidirChave({
        atual: incerta,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos,
        gerarChave,
      });
      expect(d.tipo).toBe("enviar");
      if (d.tipo === "enviar") expect(d.operacao.chave).toBe(a.operacao.chave);
    }
    expect(gerarChave).toHaveBeenCalledTimes(1);
  });

  test("15. assinatura diferente com operação incerta → bloqueada; a pendente não é substituída nem apagada", () => {
    const gerarChave = geradorDeChaves();
    const r = tentar({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 0,
      gerarChave,
      armazenamento,
      erro: erroRede(),
    });
    const bruto = armazenamento.getItem(chaveDeArmazenamento(VENDA_A));

    for (const outra of [
      INTEGRAL,
      { ...PARCIAL, itens: [{ itemId: "item-1", quantidade: 1 }] },
      { ...PARCIAL, itens: [...(PARCIAL.itens ?? []), { itemId: "item-3", quantidade: 1 }] },
    ] satisfies CancelamentoPayload[]) {
      const d = decidirChave({
        atual: r.atual,
        vendaId: VENDA_A,
        payload: outra,
        eventos: 1,
        gerarChave,
      });
      expect(d.tipo).toBe("bloqueada");
      if (d.tipo === "bloqueada") expect(d.pendente.chave).toBe("chave-0001-aaaa");
    }
    expect(gerarChave).toHaveBeenCalledTimes(1);
    expect(armazenamento.getItem(chaveDeArmazenamento(VENDA_A))).toBe(bruto);
  });

  describe("18. comportamento da Fase 22.5.1 preservado", () => {
    test("duplo clique (mesma operação, mesmos eventos) → mesma chave", () => {
      const gerarChave = geradorDeChaves();
      const a = decidirChave({
        atual: null,
        vendaId: VENDA_A,
        payload: INTEGRAL,
        eventos: 0,
        gerarChave,
      });
      if (a.tipo !== "enviar") throw new Error("inalcançável");
      const b = decidirChave({
        atual: a.operacao,
        vendaId: VENDA_A,
        payload: INTEGRAL,
        eventos: 0,
        gerarChave,
      });
      expect(b.tipo === "enviar" && b.operacao.chave).toBe(a.operacao.chave);
    });

    test("erro definitivo mantém a chave para nova tentativa idêntica", () => {
      const gerarChave = geradorDeChaves();
      const r = tentar({
        atual: null,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
        armazenamento,
        erro: erroHttp(400, "VALIDATION_ERROR"),
      });
      expect(r.atual?.incerta).toBe(false);
      const d = decidirChave({
        atual: r.atual,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
      });
      expect(d.tipo === "enviar" && d.operacao.chave).toBe("chave-0001-aaaa");
    });

    test("fora de incerteza, alterar itens → chave nova", () => {
      const gerarChave = geradorDeChaves();
      const a = decidirChave({
        atual: null,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
      });
      if (a.tipo !== "enviar") throw new Error("inalcançável");
      const b = decidirChave({
        atual: a.operacao,
        vendaId: VENDA_A,
        payload: { ...PARCIAL, itens: [{ itemId: "item-1", quantidade: 1 }] },
        eventos: 0,
        gerarChave,
      });
      expect(b.tipo === "enviar" && b.operacao.chave).toBe("chave-0002-aaaa");
    });

    test("fora de incerteza, novo evento na venda → chave nova", () => {
      const gerarChave = geradorDeChaves();
      const a = decidirChave({
        atual: null,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
      });
      if (a.tipo !== "enviar") throw new Error("inalcançável");
      const b = decidirChave({
        atual: a.operacao,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 1,
        gerarChave,
      });
      expect(b.tipo === "enviar" && b.operacao.chave).toBe("chave-0002-aaaa");
    });

    test("nova operação após sucesso → chave nova", () => {
      const gerarChave = geradorDeChaves();
      const r = tentar({
        atual: null,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 0,
        gerarChave,
        armazenamento,
        erro: null,
      });
      expect(r.atual).toBeNull();
      const d = decidirChave({
        atual: r.atual,
        vendaId: VENDA_A,
        payload: PARCIAL,
        eventos: 1,
        gerarChave,
      });
      expect(d.tipo === "enviar" && d.operacao.chave).toBe("chave-0002-aaaa");
    });

    test("assinatura canônica: motivo fora, itens ordenados, integral sem itens", () => {
      expect(assinaturaDaOperacao(PARCIAL)).toBe(
        '{"tipo":"parcial","itens":[{"itemId":"item-1","quantidade":2},{"itemId":"item-2","quantidade":1}]}',
      );
      expect(
        assinaturaDaOperacao({ tipo: "integral", itens: [{ itemId: "x", quantidade: 1 }] }),
      ).toBe('{"tipo":"integral","itens":[]}');
    });
  });
});

// ─── 9: isolamento entre vendas ────────────────────────────────────────────────────────────────────────────────────

describe("9. isolamento entre vendas", () => {
  test("operação incerta da venda A não é recuperada nem aplicada na venda B", () => {
    const gerarChave = geradorDeChaves();
    const r = tentar({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 0,
      gerarChave,
      armazenamento,
      erro: erroTimeout(),
    });
    expect(lerOperacaoIncerta(VENDA_B, armazenamento).estado).toBe("ausente");
    // Mesmo com a operação de A em memória, B recebe chave própria (e não fica bloqueada por A).
    const d = decidirChave({
      atual: r.atual,
      vendaId: VENDA_B,
      payload: PARCIAL,
      eventos: 0,
      gerarChave,
    });
    expect(d.tipo).toBe("enviar");
    if (d.tipo === "enviar") {
      expect(d.operacao.chave).not.toBe("chave-0001-aaaa");
      expect(d.operacao.vendaId).toBe(VENDA_B);
    }
  });

  test("registro de A copiado para a chave de armazenamento de B é rejeitado (vendaId gravado confere)", () => {
    tentar({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 0,
      gerarChave: geradorDeChaves(),
      armazenamento,
      erro: erroTimeout(),
    });
    const bruto = armazenamento.getItem(chaveDeArmazenamento(VENDA_A));
    armazenamento.setItem(chaveDeArmazenamento(VENDA_B), bruto ?? "");
    expect(lerOperacaoIncerta(VENDA_B, armazenamento).estado).toBe("invalida");
  });
});

// ─── 10, 11: limpeza ───────────────────────────────────────────────────────────────────────────────────────────────

describe("limpeza", () => {
  function deixarIncerta(vendaId: string) {
    return tentar({
      atual: null,
      vendaId,
      payload: PARCIAL,
      eventos: 0,
      gerarChave: geradorDeChaves(),
      armazenamento,
      erro: erroHttp(503),
    });
  }

  test("10. sucesso (replay) remove o registro da venda e mantém o das outras", () => {
    const a = deixarIncerta(VENDA_A);
    deixarIncerta(VENDA_B);
    const r = tentar({
      atual: a.atual,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 1,
      gerarChave: geradorDeChaves(),
      armazenamento,
      erro: null,
    });
    expect(r.chaveEnviada).toBe("chave-0001-aaaa");
    expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("ausente");
    expect(lerOperacaoIncerta(VENDA_B, armazenamento).estado).toBe("recuperada");
  });

  test("11. descarte explícito remove somente a venda atual", () => {
    deixarIncerta(VENDA_A);
    deixarIncerta(VENDA_B);
    armazenamento.setItem("outra-chave-da-aplicacao", "intocada");
    expect(removerOperacaoIncerta(VENDA_A, armazenamento)).toBe(true);
    expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("ausente");
    expect(lerOperacaoIncerta(VENDA_B, armazenamento).estado).toBe("recuperada");
    expect(armazenamento.getItem("outra-chave-da-aplicacao")).toBe("intocada");
    // Depois do descarte, a mesma operação recebe chave NOVA (só por ação explícita do operador).
    const d = decidirChave({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 1,
      gerarChave: () => "chave-nova-apos-descarte",
    });
    expect(d.tipo === "enviar" && d.operacao.chave).toBe("chave-nova-apos-descarte");
  });
});

// ─── 12, 13, 14: dados inválidos e armazenamento inacessível ─────────────────────────────────────────────────────

describe("validação do que vem do sessionStorage", () => {
  const registroValido = () => ({
    versao: VERSAO_FORMATO,
    vendaId: VENDA_A,
    chave: "0b7c1d1e-6a0f-4c49-9d1b-3c1f1c7a2b11",
    assinatura: assinaturaDaOperacao(PARCIAL),
    incertaDesde: "2026-11-12T12:00:00.000Z",
  });
  const gravar = (valor: unknown) =>
    armazenamento.setItem(
      chaveDeArmazenamento(VENDA_A),
      typeof valor === "string" ? valor : JSON.stringify(valor),
    );

  test("namespace e versão explícitos na chave de armazenamento", () => {
    expect(chaveDeArmazenamento(VENDA_A)).toBe(
      `${PREFIXO_ARMAZENAMENTO}.v${VERSAO_FORMATO}.${VENDA_A}`,
    );
  });

  test("registro válido é recuperado e só contém os campos mínimos", () => {
    gravar(registroValido());
    expect(lerOperacaoIncerta(VENDA_A, armazenamento).estado).toBe("recuperada");
    persistirOperacaoIncerta(
      {
        vendaId: VENDA_B,
        assinatura: assinaturaDaOperacao(INTEGRAL),
        chave: "chave-0009-aaaa",
        eventos: null,
        incerta: true,
        incertaDesde: "2026-11-12T12:00:00.000Z",
      },
      armazenamento,
    );
    const gravado = JSON.parse(armazenamento.getItem(chaveDeArmazenamento(VENDA_B)) ?? "{}");
    expect(Object.keys(gravado).sort()).toEqual(
      ["assinatura", "chave", "incertaDesde", "vendaId", "versao"].sort(),
    );
  });

  test("12. JSON inválido → 'invalida' (sem exceção, sem chave inventada)", () => {
    for (const lixo of ["{", "não é json", "", "undefined"]) {
      gravar(lixo);
      expect(lerOperacaoIncerta(VENDA_A, armazenamento)).toEqual({ estado: "invalida" });
    }
  });

  test("13. estrutura incompatível ou incompleta → 'invalida'", () => {
    const base = registroValido();
    const variantes: unknown[] = [
      null,
      [],
      42,
      "texto",
      { ...base, versao: 2 },
      { ...base, versao: "1" },
      (({ versao, ...resto }) => resto)(base),
      (({ chave, ...resto }) => resto)(base),
      (({ assinatura, ...resto }) => resto)(base),
      (({ incertaDesde, ...resto }) => resto)(base),
      (({ vendaId, ...resto }) => resto)(base),
      { ...base, chave: "" },
      { ...base, chave: "x y" },
      { ...base, chave: 123 },
      { ...base, incertaDesde: "ontem" },
      { ...base, assinatura: "{}" },
      { ...base, assinatura: '{"tipo":"parcial","itens":[]}' },
      { ...base, assinatura: '{"tipo":"integral","itens":[{"itemId":"a","quantidade":1}]}' },
      // fora da forma canônica: itens fora de ordem
      {
        ...base,
        assinatura:
          '{"tipo":"parcial","itens":[{"itemId":"b","quantidade":1},{"itemId":"a","quantidade":1}]}',
      },
      // item repetido
      {
        ...base,
        assinatura:
          '{"tipo":"parcial","itens":[{"itemId":"a","quantidade":1},{"itemId":"a","quantidade":1}]}',
      },
      // quantidade inválida
      { ...base, assinatura: '{"tipo":"parcial","itens":[{"itemId":"a","quantidade":0}]}' },
      { ...base, assinatura: '{"tipo":"parcial","itens":[{"itemId":"a","quantidade":1.5}]}' },
      // campo extra
      { ...base, assinatura: '{"tipo":"integral","itens":[],"motivo":"x"}' },
      { ...base, vendaId: VENDA_B },
    ];
    for (const v of variantes) {
      gravar(v);
      expect(lerOperacaoIncerta(VENDA_A, armazenamento)).toEqual({ estado: "invalida" });
    }
  });

  test("14. sessionStorage inacessível → leitura 'indisponivel', escrita/remoção retornam false, sem lançar", () => {
    const falho = new ArmazenamentoQueFalha();
    expect(lerOperacaoIncerta(VENDA_A, falho)).toEqual({ estado: "indisponivel" });
    expect(lerOperacaoIncerta(VENDA_A, null)).toEqual({ estado: "indisponivel" });
    const incerta = marcarIncerta(
      {
        vendaId: VENDA_A,
        assinatura: assinaturaDaOperacao(PARCIAL),
        chave: "chave-0001-aaaa",
        eventos: 0,
        incerta: false,
        incertaDesde: null,
      },
      new Date(),
    );
    expect(persistirOperacaoIncerta(incerta, falho)).toBe(false);
    expect(persistirOperacaoIncerta(incerta, null)).toBe(false);
    expect(removerOperacaoIncerta(VENDA_A, falho)).toBe(false);
    // A proteção em memória continua valendo mesmo sem persistir.
    const d = decidirChave({
      atual: incerta,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 3,
      gerarChave: () => "nao-deveria",
    });
    expect(d.tipo === "enviar" && d.operacao.chave).toBe("chave-0001-aaaa");
  });

  test("persistir uma operação NÃO incerta não grava nada", () => {
    expect(
      persistirOperacaoIncerta(
        {
          vendaId: VENDA_A,
          assinatura: assinaturaDaOperacao(PARCIAL),
          chave: "chave-0001-aaaa",
          eventos: 0,
          incerta: false,
          incertaDesde: null,
        },
        armazenamento,
      ),
    ).toBe(false);
    expect(armazenamento.length).toBe(0);
  });
});

// ─── 16: recuperação não dispara requisição ───────────────────────────────────────────────────────────────────────

describe("16. recuperação não dispara requisição", () => {
  test("ler + decidir a chave após reload não chama fetch nem gera chave", () => {
    tentar({
      atual: null,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 0,
      gerarChave: geradorDeChaves(),
      armazenamento,
      erro: erroHttp(502),
    });
    const gerarChave = geradorDeChaves();
    const leitura = lerOperacaoIncerta(VENDA_A, armazenamento);
    if (leitura.estado !== "recuperada") throw new Error("inalcançável");
    decidirChave({
      atual: leitura.operacao,
      vendaId: VENDA_A,
      payload: PARCIAL,
      eventos: 1,
      gerarChave,
    });
    expect(fetchMonitorado).toHaveBeenCalledTimes(0);
    expect(gerarChave).toHaveBeenCalledTimes(0);
  });

  test("registro inválido também não dispara requisição", () => {
    armazenamento.setItem(chaveDeArmazenamento(VENDA_A), "{corrompido");
    lerOperacaoIncerta(VENDA_A, armazenamento);
    expect(fetchMonitorado).toHaveBeenCalledTimes(0);
  });
});

// ─── 17: classificação de erros ───────────────────────────────────────────────────────────────────────────────────

describe("17. classificação de erros", () => {
  test("incertos: TIMEOUT, NETWORK_ERROR, 502, 503, 504 (inclusive com code vindo do corpo)", () => {
    expect(ehResultadoIncerto(erroTimeout())).toBe(true);
    expect(ehResultadoIncerto(erroRede())).toBe(true);
    for (const status of [502, 503, 504]) {
      expect(ehResultadoIncerto(erroHttp(status))).toBe(true);
      expect(ehResultadoIncerto(erroHttp(status, "SERVICE_UNAVAILABLE"))).toBe(true);
    }
  });

  test("definitivos NÃO são incertos", () => {
    for (const [status, code] of [
      [400, "VALIDATION_ERROR"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [422, "HTTP_ERROR"],
      [429, "HTTP_ERROR"],
      [500, "INTERNAL_SERVER_ERROR"],
      [501, "HTTP_ERROR"],
      [505, "HTTP_ERROR"],
    ] as const) {
      expect(ehResultadoIncerto(erroHttp(status, code))).toBe(false);
    }
  });

  test("valores que não são ApiError não são incertos", () => {
    expect(ehResultadoIncerto(new Error("TIMEOUT"))).toBe(false);
    expect(ehResultadoIncerto({ code: "TIMEOUT", statusCode: 408 })).toBe(false);
    expect(ehResultadoIncerto(null)).toBe(false);
    expect(ehResultadoIncerto(undefined)).toBe(false);
  });
});
