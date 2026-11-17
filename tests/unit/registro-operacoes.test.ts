/**
 * Fase 22.8.9.5 — registro DURÁVEL das operações incertas (`src/services/operacoes/registro-operacoes.ts`).
 * Executar com: `bun test tests/unit`
 *
 * O armazenamento durável é simulado por um `Storage` em memória que sobrevive à "reabertura" (um repositório novo
 * sobre o mesmo meio), e o transporte nativo por um invocador falso com as MESMAS regras do Rust (`operacoes.rs`,
 * testado à parte com `cargo test`). Nada chama o Tauri, o backend ou o Credential Manager. Dados sintéticos.
 */
import { describe, expect, test } from "bun:test";
import {
  PREFIXO_REGISTRO_WEB,
  carregarOperacao,
  criarArmazenamentoNativo,
  criarArmazenamentoSobreStorage,
  gravarOperacao,
  lerRegistro,
  removerOperacao,
  serializarRegistro,
  type ArmazenamentoOperacoes,
  type DependenciasRegistro,
} from "@/services/operacoes/registro-operacoes";
import {
  assinaturaDaOperacao,
  chaveDeArmazenamento,
  decidirChave,
  VERSAO_FORMATO_LEGADO,
  type OperacaoCancelamento,
} from "@/utils/operacao-cancelamento";

const VENDA = "665f1c2b9a1e4b0012345678";
const OUTRA_VENDA = "665f1c2b9a1e4b0087654321";
const CHAVE = "11111111-1111-4111-8111-111111111111";
const OUTRA_CHAVE = "22222222-2222-4222-8222-222222222222";
const ASSINATURA = assinaturaDaOperacao({
  tipo: "parcial",
  itens: [{ itemId: "item-1", quantidade: 2 }],
});
const AGORA = new Date("2026-11-16T12:00:00.000Z");

class StorageMemoria implements Storage {
  dados = new Map<string, string>();
  falharEscrita = false;
  falharLeitura = false;
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(k: string) {
    if (this.falharLeitura) throw new Error("leitura indisponível");
    return this.dados.get(k) ?? null;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  removeItem(k: string) {
    if (this.falharEscrita) throw new Error("escrita indisponível");
    this.dados.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.falharEscrita) throw new Error("escrita indisponível");
    this.dados.set(k, v);
  }
}

function operacao(parcial: Partial<OperacaoCancelamento> = {}): OperacaoCancelamento {
  return {
    vendaId: VENDA,
    assinatura: ASSINATURA,
    chave: CHAVE,
    eventos: 0,
    incerta: false,
    incertaDesde: AGORA.toISOString(),
    ...parcial,
  };
}

/** Um "aplicativo": repositório sobre o meio durável e o `sessionStorage` legado indicados. */
function abrir(
  duravel: StorageMemoria,
  legado: StorageMemoria | null = new StorageMemoria(),
  armazenamento?: ArmazenamentoOperacoes,
): DependenciasRegistro {
  return {
    armazenamento: armazenamento ?? criarArmazenamentoSobreStorage(() => duravel, "memoria"),
    legado: () => legado,
    agora: () => AGORA,
  };
}

function registroLegadoV2(
  estado: "em_andamento" | "incerta",
  chave = CHAVE,
  venda = VENDA,
): string {
  return JSON.stringify({
    versao: 2,
    vendaId: venda,
    chave,
    assinatura: ASSINATURA,
    iniciadaEm: AGORA.toISOString(),
    estado,
  });
}

describe("persistência durável (1, 2, 3, 4)", () => {
  test("1. criar operação incerta e persistir: gravada, conferida e sem nenhum dado sensível", async () => {
    const meio = new StorageMemoria();
    const deps = abrir(meio);
    expect(await gravarOperacao(operacao({ incerta: true }), "incerta", deps)).toEqual({
      ok: true,
    });
    const bruto = meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)!;
    const registro = JSON.parse(bruto);
    expect(Object.keys(registro).sort()).toEqual(
      ["assinatura", "chave", "estado", "gravadaEm", "iniciadaEm", "vendaId", "versao"].sort(),
    );
    expect(registro).toMatchObject({
      versao: 3,
      vendaId: VENDA,
      chave: CHAVE,
      assinatura: ASSINATURA,
      estado: "incerta",
    });
    for (const proibido of ["token", "senha", "Bearer", "eyJ", "motivo", "cliente"])
      expect(bruto).not.toContain(proibido);
  });

  test("2 e 3. recarregar a tela e fechar/reabrir o aplicativo: um repositório NOVO sobre o mesmo meio recupera a operação", async () => {
    const meio = new StorageMemoria();
    await gravarOperacao(operacao(), "em_andamento", abrir(meio));
    // Reabertura: legado vazio (o sessionStorage não sobrevive a fechar o app), repositório novo.
    const leitura = await carregarOperacao(VENDA, abrir(meio, new StorageMemoria()));
    expect(leitura).toEqual({
      estado: "recuperada",
      origem: "em_andamento",
      duravel: true,
      migrada: false,
      operacao: {
        vendaId: VENDA,
        assinatura: ASSINATURA,
        chave: CHAVE,
        eventos: null,
        incerta: true,
        incertaDesde: AGORA.toISOString(),
      },
    });
  });

  test("4. encerramento inesperado ANTES da resposta: o registro gravado antes do envio (em_andamento) é recuperado como incerto", async () => {
    const meio = new StorageMemoria();
    expect(await gravarOperacao(operacao(), "em_andamento", abrir(meio))).toEqual({ ok: true });
    // "Queda": nada mais roda (nem a marcação como incerta). Reabertura:
    const leitura = await carregarOperacao(VENDA, abrir(meio, null));
    expect(leitura.estado).toBe("recuperada");
    if (leitura.estado !== "recuperada") throw new Error();
    expect(leitura.origem).toBe("em_andamento");
    expect(leitura.operacao.incerta).toBe(true);
    expect(leitura.operacao.chave).toBe(CHAVE);
  });
});

describe("chave e assinatura (5, 19)", () => {
  test("5. a operação recuperada reusa a MESMA chave e assinatura no reenvio (decidirChave)", async () => {
    const meio = new StorageMemoria();
    await gravarOperacao(operacao({ incerta: true }), "incerta", abrir(meio));
    const leitura = await carregarOperacao(VENDA, abrir(meio));
    if (leitura.estado !== "recuperada") throw new Error();
    const decisao = decidirChave({
      atual: leitura.operacao,
      vendaId: VENDA,
      payload: { tipo: "parcial", itens: [{ itemId: "item-1", quantidade: 2 }] },
      eventos: 7, // o nº de eventos mudou (refetch): irrelevante numa operação incerta
      gerarChave: () => OUTRA_CHAVE,
    });
    expect(decisao).toEqual({ tipo: "enviar", operacao: leitura.operacao });
    // Atualizar o estado da MESMA operação é permitido e mantém chave e assinatura.
    expect(await gravarOperacao(leitura.operacao, "incerta", abrir(meio))).toEqual({ ok: true });
    expect(lerRegistro(VENDA, meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)!)).toMatchObject({
      chave: CHAVE,
      assinatura: ASSINATURA,
    });
  });

  test("19. outra operação NUNCA substitui a pendente em silêncio (conflito; nada muda)", async () => {
    const meio = new StorageMemoria();
    await gravarOperacao(operacao({ incerta: true }), "incerta", abrir(meio));
    const antes = meio.getItem(PREFIXO_REGISTRO_WEB + VENDA);
    const outra = operacao({
      chave: OUTRA_CHAVE,
      assinatura: assinaturaDaOperacao({ tipo: "integral", itens: [] }),
    });
    expect(await gravarOperacao(outra, "em_andamento", abrir(meio))).toEqual({
      ok: false,
      motivo: "conflito",
    });
    expect(meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)).toBe(antes);
    // Remoção por conclusão de OUTRA operação também não apaga a pendente.
    expect(await removerOperacao(VENDA, OUTRA_CHAVE, abrir(meio))).toBe(false);
    expect(meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)).toBe(antes);
  });
});

describe("descarte e conclusão (13)", () => {
  test("13. só a conclusão da MESMA operação ou o descarte explícito removem; outras vendas ficam intactas", async () => {
    const meio = new StorageMemoria();
    await gravarOperacao(operacao({ incerta: true }), "incerta", abrir(meio));
    await gravarOperacao(operacao({ vendaId: OUTRA_VENDA, incerta: true }), "incerta", abrir(meio));
    expect(await removerOperacao(VENDA, CHAVE, abrir(meio))).toBe(true); // conclusão confirmada
    expect((await carregarOperacao(VENDA, abrir(meio))).estado).toBe("ausente");
    expect((await carregarOperacao(OUTRA_VENDA, abrir(meio))).estado).toBe("recuperada");
    expect(await removerOperacao(OUTRA_VENDA, null, abrir(meio))).toBe(true); // descarte explícito
    expect((await carregarOperacao(OUTRA_VENDA, abrir(meio))).estado).toBe("ausente");
  });
});

describe("migração do sessionStorage legado (16)", () => {
  test("16. registro v2 é migrado: gravado e conferido no durável ANTES de sair do legado", async () => {
    const meio = new StorageMemoria();
    const legado = new StorageMemoria();
    legado.setItem(chaveDeArmazenamento(VENDA), registroLegadoV2("incerta"));
    const leitura = await carregarOperacao(VENDA, abrir(meio, legado));
    expect(leitura).toMatchObject({
      estado: "recuperada",
      origem: "incerta",
      duravel: true,
      migrada: true,
    });
    expect(lerRegistro(VENDA, meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)!)).toMatchObject({
      chave: CHAVE,
      estado: "incerta",
    });
    expect(legado.length).toBe(0);
  });

  test("16. registro v1 (Fase 22.5.2) também é migrado, como incerto", async () => {
    const meio = new StorageMemoria();
    const legado = new StorageMemoria();
    legado.setItem(
      chaveDeArmazenamento(VENDA, VERSAO_FORMATO_LEGADO),
      JSON.stringify({
        versao: 1,
        vendaId: VENDA,
        chave: CHAVE,
        assinatura: ASSINATURA,
        incertaDesde: AGORA.toISOString(),
      }),
    );
    const leitura = await carregarOperacao(VENDA, abrir(meio, legado));
    expect(leitura).toMatchObject({ estado: "recuperada", origem: "legado_v1", migrada: true });
    expect(lerRegistro(VENDA, meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)!)?.estado).toBe("incerta");
    expect(legado.length).toBe(0);
  });

  test("16. falha na migração: o legado fica INTACTO e a operação é recuperada dele, sinalizada como não durável", async () => {
    const meio = new StorageMemoria();
    meio.falharEscrita = true;
    const legado = new StorageMemoria();
    legado.setItem(chaveDeArmazenamento(VENDA), registroLegadoV2("em_andamento"));
    const leitura = await carregarOperacao(VENDA, abrir(meio, legado));
    expect(leitura).toMatchObject({
      estado: "recuperada",
      origem: "em_andamento",
      duravel: false,
      migrada: false,
    });
    expect(legado.getItem(chaveDeArmazenamento(VENDA))).toBe(registroLegadoV2("em_andamento"));
  });

  test("16. durável ilegível tem precedência sobre o legado (nunca se escolhe uma das duas em silêncio)", async () => {
    const meio = new StorageMemoria();
    meio.setItem(PREFIXO_REGISTRO_WEB + VENDA, "{corrompido");
    const legado = new StorageMemoria();
    legado.setItem(chaveDeArmazenamento(VENDA), registroLegadoV2("incerta"));
    expect(await carregarOperacao(VENDA, abrir(meio, legado))).toEqual({ estado: "invalida" });
    expect(legado.length).toBe(1);
  });
});

describe("registros corrompidos (17)", () => {
  test("17. ilegível ⇒ 'invalida' (sem lançar, sem chave inventada); outras vendas seguem legíveis; só o descarte explícito remove", async () => {
    const meio = new StorageMemoria();
    await gravarOperacao(operacao({ vendaId: OUTRA_VENDA, incerta: true }), "incerta", abrir(meio));
    for (const lixo of [
      "{corrompido",
      "null",
      "[]",
      JSON.stringify({ versao: 3, vendaId: VENDA, chave: CHAVE }),
      serializarRegistro(operacao({ vendaId: OUTRA_VENDA }), "incerta", AGORA), // registro de outra venda
      serializarRegistro(operacao(), "incerta", AGORA).replace('"incerta"', '"concluida"'),
      serializarRegistro(operacao(), "incerta", AGORA).replace("}", ',"accessToken":"x"}'),
    ]) {
      meio.dados.set(PREFIXO_REGISTRO_WEB + VENDA, lixo);
      expect(await carregarOperacao(VENDA, abrir(meio))).toEqual({ estado: "invalida" });
      // Nova operação não sobrescreve o ilegível; a conclusão de uma chave também não o remove.
      expect(await gravarOperacao(operacao(), "em_andamento", abrir(meio))).toEqual({
        ok: false,
        motivo: "conflito",
      });
      expect(await removerOperacao(VENDA, CHAVE, abrir(meio))).toBe(false);
      expect(meio.getItem(PREFIXO_REGISTRO_WEB + VENDA)).toBe(lixo);
    }
    expect((await carregarOperacao(OUTRA_VENDA, abrir(meio))).estado).toBe("recuperada");
    expect(await removerOperacao(VENDA, null, abrir(meio))).toBe(true);
    expect((await carregarOperacao(VENDA, abrir(meio))).estado).toBe("ausente");
  });

  test("17. armazenamento inacessível: 'indisponivel', sem lançar", async () => {
    const meio = new StorageMemoria();
    meio.falharLeitura = true;
    expect(await carregarOperacao(VENDA, abrir(meio))).toEqual({ estado: "indisponivel" });
    expect(
      await carregarOperacao(
        VENDA,
        abrir(
          meio,
          null,
          criarArmazenamentoSobreStorage(() => null),
        ),
      ),
    ).toEqual({
      estado: "indisponivel",
    });
  });
});

describe("falha de gravação (20)", () => {
  test("20. falha ao gravar nunca é relatada como sucesso", async () => {
    const meio = new StorageMemoria();
    meio.falharEscrita = true;
    expect(await gravarOperacao(operacao(), "em_andamento", abrir(meio))).toEqual({
      ok: false,
      motivo: "falha",
    });
  });

  test("20. gravação 'aceita' mas que não é lida de volta igual NÃO conta como persistida", async () => {
    const meio = new StorageMemoria();
    const base = criarArmazenamentoSobreStorage(() => meio, "memoria");
    const mentiroso: ArmazenamentoOperacoes = {
      ...base,
      gravar: async () => ({ ok: true, valor: null }), // diz que gravou, mas não gravou
    };
    expect(await gravarOperacao(operacao(), "em_andamento", abrir(meio, null, mentiroso))).toEqual({
      ok: false,
      motivo: "falha",
    });
  });
});

describe("transporte nativo (desktop)", () => {
  /** Invocador falso com as regras do Rust; registra os comandos chamados. */
  function invocadorFalso() {
    const arquivos = new Map<string, string>();
    const chamadas: string[] = [];
    const chaveDe = (c: string | undefined) =>
      c ? (JSON.parse(c) as { chave?: string }).chave : undefined;
    const invocar = async (comando: string, args: Record<string, unknown>) => {
      chamadas.push(comando);
      const venda = args["vendaId"] as string;
      if (comando === "operacao_ler") return arquivos.get(venda) ?? null;
      if (comando === "operacao_gravar") {
        const conteudo = args["conteudo"] as string;
        if (arquivos.has(venda) && chaveDe(arquivos.get(venda)) !== chaveDe(conteudo))
          throw "CONFLITO";
        arquivos.set(venda, conteudo);
        return null;
      }
      if (comando === "operacao_remover") {
        arquivos.delete(venda);
        return null;
      }
      throw new Error("comando desconhecido");
    };
    return { arquivos, chamadas, invocar };
  }

  test("usa SOMENTE os comandos operacao_* (nunca os de sessão/Credential Manager) e mapeia os códigos", async () => {
    const f = invocadorFalso();
    const deps: DependenciasRegistro = {
      armazenamento: criarArmazenamentoNativo(f.invocar),
      legado: () => null,
      agora: () => AGORA,
    };
    expect(await gravarOperacao(operacao(), "em_andamento", deps)).toEqual({ ok: true });
    expect(await gravarOperacao(operacao({ chave: OUTRA_CHAVE }), "em_andamento", deps)).toEqual({
      ok: false,
      motivo: "conflito",
    });
    expect((await carregarOperacao(VENDA, deps)).estado).toBe("recuperada");
    expect(await removerOperacao(VENDA, CHAVE, deps)).toBe(true);
    expect(new Set(f.chamadas)).toEqual(
      new Set(["operacao_gravar", "operacao_ler", "operacao_remover"]),
    );
  });

  test("falha de IPC/ACL ou resposta fora do contrato: nunca vira sucesso nem 'ausente'", async () => {
    const quebrado = criarArmazenamentoNativo(async () => {
      throw new Error("not allowed");
    });
    const deps: DependenciasRegistro = {
      armazenamento: quebrado,
      legado: () => null,
      agora: () => AGORA,
    };
    expect(await gravarOperacao(operacao(), "em_andamento", deps)).toEqual({
      ok: false,
      motivo: "falha",
    });
    expect(await carregarOperacao(VENDA, deps)).toEqual({ estado: "indisponivel" });
    const estranho = criarArmazenamentoNativo(async () => 42);
    expect(await estranho.ler(VENDA)).toEqual({ ok: false, codigo: "FALHA_DE_INVOCACAO" });
  });
});

describe("isolamento (18)", () => {
  test("18. meios diferentes (identidade oficial × isolada) nunca enxergam os registros um do outro", async () => {
    const oficial = new StorageMemoria();
    const isolado = new StorageMemoria();
    await gravarOperacao(operacao({ incerta: true }), "incerta", abrir(oficial));
    expect((await carregarOperacao(VENDA, abrir(isolado))).estado).toBe("ausente");
    expect((await carregarOperacao(VENDA, abrir(oficial))).estado).toBe("recuperada");
  });
});
