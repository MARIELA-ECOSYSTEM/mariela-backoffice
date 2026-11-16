/**
 * Fase 22.8.8.8.2.2 (M8.2.2) — aviso de MODO LEGADO por motivo (`src/hooks/aviso-modo-legado.ts`).
 * Executar com: `bun test tests/unit`
 *
 * 1) Controle de duplicidade, com um notificador falso que registra cada aviso emitido.
 * 2) O MESMO controle alimentado pela máquina de estados REAL de `sessao-nativa.ts` (cofre simulado, sem Tauri e sem
 *    Credential Manager), provando as transições legado → nativo → legado.
 * Todos os valores são sintéticos.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";

const { criarAvisoModoLegado, mensagemDoModoLegado } = await import("@/hooks/aviso-modo-legado");
const nativa = await import("@/services/auth/sessao-nativa");
const { criarCofreSessao } = await import("@/services/auth/cofre-sessao");
const { limparSessao, salvarSessao, marcadorSessaoNativaStorageAtual } =
  await import("@/services/auth/token-storage");
type EstadoArmazenamento = import("@/services/auth/sessao-nativa").EstadoArmazenamento;
type TransporteCofre = import("@/services/auth/cofre-sessao").TransporteCofre;

const legado = (motivo: string) => ({ modo: "legado", motivo }) as EstadoArmazenamento;
const NATIVO: EstadoArmazenamento = { modo: "nativo" };
const WEB: EstadoArmazenamento = { modo: "web" };

function controle() {
  const avisos: { mensagem: string; id: string }[] = [];
  const aviso = criarAvisoModoLegado((mensagem, id) => avisos.push({ mensagem, id }));
  return { aviso, avisos };
}

describe("controle do aviso por motivo", () => {
  test("1. primeiro ingresso em modo legado exibe o aviso", () => {
    const { aviso, avisos } = controle();
    expect(aviso.avaliar(legado("cofre_indisponivel"))).toBe(true);
    expect(avisos).toEqual([
      {
        mensagem: mensagemDoModoLegado("cofre_indisponivel"),
        id: "modo-legado:cofre_indisponivel",
      },
    ]);
  });

  test("2. o mesmo motivo de novo (re-renderização, nova validação) não repete", () => {
    const { aviso, avisos } = controle();
    aviso.avaliar(legado("cofre_indisponivel"));
    for (let i = 0; i < 5; i++) expect(aviso.avaliar(legado("cofre_indisponivel"))).toBe(false);
    expect(avisos).toHaveLength(1);
  });

  test("3 e 4. mudança de motivo exibe novo aviso; permanecer no segundo motivo não repete", () => {
    const { aviso, avisos } = controle();
    aviso.avaliar(legado("cofre_indisponivel"));
    expect(aviso.avaliar(legado("sessoes_divergentes"))).toBe(true);
    expect(aviso.avaliar(legado("sessoes_divergentes"))).toBe(false);
    expect(avisos.map((a) => a.id)).toEqual([
      "modo-legado:cofre_indisponivel",
      "modo-legado:sessoes_divergentes",
    ]);
    expect(avisos[1]!.mensagem).toBe(mensagemDoModoLegado("sessoes_divergentes"));
  });

  test("5 e 6. sair do modo legado não avisa; um novo ingresso avisa de novo, mesmo pelo motivo anterior", () => {
    const { aviso, avisos } = controle();
    aviso.avaliar(legado("cofre_indisponivel"));
    expect(aviso.avaliar(NATIVO)).toBe(false); // saída: nenhum aviso
    expect(avisos).toHaveLength(1);
    expect(aviso.avaliar(legado("cofre_indisponivel"))).toBe(true); // novo ingresso, mesmo motivo
    expect(avisos).toHaveLength(2);
  });

  test("a sequência do exemplo da fase", () => {
    const { aviso, avisos } = controle();
    const sequencia = [
      legado("cofre_indisponivel"), // avisa
      legado("cofre_indisponivel"), // não repete
      legado("sessoes_divergentes"), // avisa
      legado("sessoes_divergentes"), // não repete
      NATIVO, // sai: nenhum aviso
      legado("cofre_indisponivel"), // avisa de novo
    ];
    expect(sequencia.map((e) => aviso.avaliar(e))).toEqual([true, false, true, false, false, true]);
    expect(avisos).toHaveLength(3);
  });

  test("7. estado normal (nativo, web) nunca avisa", () => {
    const { aviso, avisos } = controle();
    for (const e of [NATIVO, WEB, NATIVO, WEB]) expect(aviso.avaliar(e)).toBe(false);
    expect(avisos).toEqual([]);
  });

  test("estado ainda desconhecido (preparação não terminou) não avisa nem esquece o último motivo", () => {
    const { aviso, avisos } = controle();
    aviso.avaliar(legado("cofre_indisponivel"));
    expect(aviso.avaliar(null)).toBe(false);
    expect(aviso.avaliar(legado("cofre_indisponivel"))).toBe(false);
    expect(avisos).toHaveLength(1);
  });

  test("8. motivo ausente ou desconhecido: aviso genérico seguro, sem expor identificadores internos", () => {
    const { aviso, avisos } = controle();
    expect(aviso.avaliar({ modo: "legado" } as unknown as EstadoArmazenamento)).toBe(true);
    expect(aviso.avaliar(legado("motivo_novo_interno_0x80070490"))).toBe(true);
    for (const { mensagem } of avisos) {
      expect(mensagem).toBe(mensagemDoModoLegado("cofre_indisponivel"));
      for (const proibido of [
        "motivo_novo",
        "0x8007",
        "undefined",
        "cofre_indisponivel",
        "sessao:v1",
      ]) {
        expect(mensagem).not.toContain(proibido);
      }
    }
  });

  test("mensagens de todos os motivos conhecidos são genéricas (sem identificadores, tokens ou alvo)", () => {
    for (const motivo of ["cofre_indisponivel", "migracao_nao_confirmada", "sessoes_divergentes"]) {
      const m = mensagemDoModoLegado(motivo);
      for (const proibido of [motivo, "token", "sessao:v1", "com.mariela", "0x", "ERROR_"]) {
        expect(m).not.toContain(proibido);
      }
    }
  });

  test("9. atualizações próximas ou concorrentes da mesma transição avisam UMA vez", async () => {
    const { aviso, avisos } = controle();
    const e = legado("migracao_nao_confirmada");
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? Promise.resolve() : new Promise((r) => setTimeout(r, 0))).then(() =>
          aviso.avaliar(e),
        ),
      ),
    );
    expect(avisos).toHaveLength(1);
    // Cada motivo tem um id próprio: a pilha de notificações também substitui, em vez de empilhar, um repetido.
    expect(avisos[0]!.id).toBe("modo-legado:migracao_nao_confirmada");
  });

  test("controles independentes não compartilham estado (um por contexto de página)", () => {
    const a = controle();
    const b = controle();
    a.aviso.avaliar(legado("cofre_indisponivel"));
    expect(b.aviso.avaliar(legado("cofre_indisponivel"))).toBe(true);
  });
});

// ─── Com a máquina de estados real de sessao-nativa.ts ────────────────────────────────────────────────────────────

class CofreFalso implements TransporteCofre {
  ultimoSeq = 0;
  conteudo: string | null = null;
  falharLeitura = false;
  falharGravacao = false;
  disponivel() {
    return true;
  }
  async invocar(comando: string, args?: Record<string, unknown>): Promise<unknown> {
    if (comando === "sessao_carregar") {
      if (this.falharLeitura) throw "COFRE_INDISPONIVEL";
      return { conteudo: this.conteudo, seq: this.ultimoSeq };
    }
    const seq = args?.["seq"] as number;
    if (seq <= this.ultimoSeq) throw "GRAVACAO_OBSOLETA";
    this.ultimoSeq = seq;
    if (comando === "sessao_gravar") {
      if (this.falharGravacao) throw "COFRE_INDISPONIVEL";
      this.conteudo = args?.["conteudo"] as string;
    } else this.conteudo = null;
    return null;
  }
}

const sessaoSintetica = {
  accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtOC4yLjIifQ.YXNzaW5hdHVyYS1zaW50ZXRpY2E",
  refreshToken: "refresh_sintetico_m822_0123456789abcdef",
  expiresIn: 900,
};

describe("controle alimentado pela máquina de estados real (sessao-nativa)", () => {
  let fake: CofreFalso;
  beforeEach(() => {
    limparSessao();
    marcadorSessaoNativaStorageAtual.clear();
    fake = new CofreFalso();
    const cofre = criarCofreSessao(fake);
    nativa.configurarSessaoNativaParaTestes({ desktop: () => true, cofre: () => cofre });
  });
  afterAll(() => {
    nativa.configurarSessaoNativaParaTestes(null);
    limparSessao();
    marcadorSessaoNativaStorageAtual.clear();
  });

  test("legado (cofre indisponível) → nativo (login gravado) → legado de novo (gravação falha) → avisa 2 vezes", async () => {
    const { aviso, avisos } = controle();
    salvarSessao(sessaoSintetica);

    fake.falharLeitura = true;
    await nativa.aguardarSessaoPreparada();
    expect(nativa.estadoArmazenamento()).toEqual({ modo: "legado", motivo: "cofre_indisponivel" });
    expect(aviso.avaliar(nativa.estadoArmazenamento())).toBe(true);
    expect(aviso.avaliar(nativa.estadoArmazenamento())).toBe(false); // persiste: não repete

    fake.falharLeitura = false;
    await nativa.persistirLoginNativo();
    expect(nativa.estadoArmazenamento()).toEqual({ modo: "nativo" });
    expect(aviso.avaliar(nativa.estadoArmazenamento())).toBe(false); // saiu: nenhum aviso

    fake.falharGravacao = true;
    await nativa.persistirLoginNativo();
    expect(nativa.estadoArmazenamento()).toEqual({ modo: "legado", motivo: "cofre_indisponivel" });
    expect(aviso.avaliar(nativa.estadoArmazenamento())).toBe(true); // novo ingresso, mesmo motivo

    expect(avisos.map((a) => a.id)).toEqual([
      "modo-legado:cofre_indisponivel",
      "modo-legado:cofre_indisponivel",
    ]);
  });

  test("antes da preparação terminar (estado null) nada é avisado", () => {
    const { aviso, avisos } = controle();
    expect(nativa.estadoArmazenamento()).toBeNull();
    expect(aviso.avaliar(nativa.estadoArmazenamento())).toBe(false);
    expect(avisos).toEqual([]);
  });
});
