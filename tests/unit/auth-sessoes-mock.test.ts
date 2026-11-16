/**
 * Fase 22.8.8.8.2 (M8.2) — Mock API: rotação do refresh token e recuperação idempotente com o contrato do backend
 * real (Fase 22.8.7.2). Executar com: `bun test tests/unit`. Tudo sintético e em memória.
 */
import { describe, expect, test } from "bun:test";
import {
  CHAVE_PERDER_RESPOSTA,
  JANELA_RECUPERACAO_MS,
  LIMITE_RECUPERACOES,
  criarSessoesMock,
  refreshDaGeracao,
  type ArmazenamentoMock,
} from "@/services/mock/auth-sessoes.mock";

const K1 = "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f";
const K2 = "1b2c3d4e-5f60-4a1b-8c2d-3e4f5a6b7c8d";
const cab = (chave?: string) => (chave ? { "Idempotency-Key": chave } : {});

function ambiente(inicio = 1_800_000_000_000) {
  const dados = new Map<string, string>();
  const armazenamento: ArmazenamentoMock = {
    get: (k) => dados.get(k) ?? null,
    set: (k, v) => void dados.set(k, v),
    remove: (k) => void dados.delete(k),
  };
  let agora = inicio;
  const mock = criarSessoesMock(armazenamento, () => agora);
  return { mock, dados, avancar: (ms: number) => (agora += ms) };
}

function codigo(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "SEM_ERRO";
}

describe("contrato da recuperação idempotente (espelho do backend)", () => {
  test("mesma chave e mesmo payload: replay do resultado ORIGINAL, sem nova rotação", () => {
    const { mock } = ambiente();
    const r1 = mock.login().refreshToken;
    const primeiro = mock.refresh(r1, cab(K1));
    const replay = mock.refresh(r1, cab(K1));
    expect(replay).toEqual(primeiro);
    expect(mock.estado()).toMatchObject({ processadas: 1, recuperadas: 1 });
    expect(mock.estado().atual).toBe(2);
  });

  test("a chave é normalizada como no backend (maiúsculas = a mesma operação)", () => {
    const { mock } = ambiente();
    const r1 = mock.login().refreshToken;
    const primeiro = mock.refresh(r1, cab(K1));
    expect(mock.refresh(r1, { "idempotency-key": K1.toUpperCase() })).toEqual(primeiro);
  });

  test("mesma chave e payload diferente: rejeição (nenhum replay de outra operação) e família revogada", () => {
    const { mock } = ambiente();
    const g1 = mock.login().refreshToken;
    const g2 = mock.refresh(g1, cab(K1)).refreshToken;
    mock.refresh(g2, cab(K2)); // g2 → g3 com a chave K2
    // K2 apresentada com o payload g1 (operação K1): rejeitada — nunca devolve g3.
    expect(codigo(() => mock.refresh(g1, cab(K2)))).toBe("REFRESH_TOKEN_REUSED");
    expect(mock.estado().atual).toBeNull();
    expect(mock.estado()).toMatchObject({ processadas: 2, recuperadas: 0 });
  });

  test("chave diferente: operação independente (cada rotação gera uma geração nova)", () => {
    const { mock } = ambiente();
    const g1 = mock.login().refreshToken;
    const a = mock.refresh(g1, cab(K1));
    const b = mock.refresh(a.refreshToken, cab(K2));
    expect(b.refreshToken).not.toBe(a.refreshToken);
    expect(mock.estado()).toMatchObject({ processadas: 2, recuperadas: 0, atual: 3 });
  });

  test("resposta perdida: a rotação é processada UMA vez; a repetição com a mesma chave recupera o mesmo par", () => {
    const { mock, dados } = ambiente();
    const r1 = mock.login().refreshToken;
    dados.set(CHAVE_PERDER_RESPOSTA, "1");
    expect(codigo(() => mock.refresh(r1, cab(K1)))).toBe("NETWORK_ERROR");
    expect(dados.has(CHAVE_PERDER_RESPOSTA)).toBe(false); // a perda é de UMA resposta
    expect(mock.estado()).toMatchObject({ processadas: 1, atual: 2 });
    const recuperado = mock.refresh(r1, cab(K1));
    expect(recuperado.refreshToken).toBe(refreshDaGeracao(2));
    expect(mock.estado()).toMatchObject({ processadas: 1, recuperadas: 1, atual: 2 }); // nenhuma duplicação
  });

  test("resposta perdida e repetição SEM a chave: reuso (como o backend), família revogada", () => {
    const { mock, dados } = ambiente();
    const r1 = mock.login().refreshToken;
    dados.set(CHAVE_PERDER_RESPOSTA, "1");
    codigo(() => mock.refresh(r1, cab(K1)));
    expect(codigo(() => mock.refresh(r1, cab()))).toBe("REFRESH_TOKEN_REUSED");
    expect(mock.estado().atual).toBeNull();
  });

  test("Idempotency-Key fora do formato: 400 VALIDATION_ERROR antes de qualquer efeito", () => {
    const { mock } = ambiente();
    const r1 = mock.login().refreshToken;
    const antes = JSON.stringify(mock.estado());
    for (const ruim of [
      "abc",
      "00000000-0000-0000-0000-000000000000",
      "6f1c8a2e-0b5d-4c3e-1a7f-2d4e6b8c0a1f",
      ` ${K1}`.slice(0, 36),
    ]) {
      expect(codigo(() => mock.refresh(r1, cab(ruim)))).toBe("VALIDATION_ERROR");
    }
    expect(JSON.stringify(mock.estado())).toBe(antes);
  });

  test("janela de 15 min vencida (mesma chave): REFRESH_TOKEN_INVALID e família revogada", () => {
    const { mock, avancar } = ambiente();
    const r1 = mock.login().refreshToken;
    mock.refresh(r1, cab(K1));
    avancar(JANELA_RECUPERACAO_MS + 1);
    expect(codigo(() => mock.refresh(r1, cab(K1)))).toBe("REFRESH_TOKEN_INVALID");
    expect(mock.estado().atual).toBeNull();
  });

  test(`no máximo ${LIMITE_RECUPERACOES} recuperações; a seguinte é reuso`, () => {
    const { mock } = ambiente();
    const r1 = mock.login().refreshToken;
    mock.refresh(r1, cab(K1));
    for (let i = 0; i < LIMITE_RECUPERACOES; i++) mock.refresh(r1, cab(K1));
    expect(codigo(() => mock.refresh(r1, cab(K1)))).toBe("REFRESH_TOKEN_REUSED");
  });

  test("sucessor já consumido (rotacionado de novo): repetir a operação antiga é reuso", () => {
    const { mock } = ambiente();
    const g1 = mock.login().refreshToken;
    const g2 = mock.refresh(g1, cab(K1)).refreshToken;
    mock.refresh(g2, cab(K2));
    expect(codigo(() => mock.refresh(g1, cab(K1)))).toBe("REFRESH_TOKEN_REUSED");
  });

  test("token desconhecido e token após logout: REFRESH_TOKEN_INVALID; logout é idempotente", () => {
    const { mock } = ambiente();
    const r1 = mock.login().refreshToken;
    expect(codigo(() => mock.refresh("mock-refresh-token-g999", cab(K1)))).toBe(
      "REFRESH_TOKEN_INVALID",
    );
    mock.logout(r1);
    mock.logout(r1);
    mock.logout("qualquer");
    expect(codigo(() => mock.refresh(r1, cab(K1)))).toBe("REFRESH_TOKEN_INVALID");
  });

  test("tokens sintéticos válidos no formato v1 do cofre (refresh base64url ≥ 16)", () => {
    const { mock } = ambiente();
    const { accessToken, refreshToken } = mock.login();
    expect(accessToken).toMatch(/^[A-Za-z0-9._~+/=-]{1,2048}$/);
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{16,512}$/);
  });

  test("estado corrompido no armazenamento é ignorado (recomeça), sem lançar", () => {
    const { mock, dados } = ambiente();
    dados.set("mariela.mock.auth.v1", "{nao json");
    expect(mock.login().refreshToken).toBe(refreshDaGeracao(1));
  });
});
