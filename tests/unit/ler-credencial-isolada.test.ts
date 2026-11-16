/**
 * Fase 22.8.8.8.2 (M8.2) — leitor RESTRITO da credencial sintética (`scripts/ler-credencial-isolada.ps1`).
 * Inspeção do código (alvo fixo, somente leitura, nenhum campo sensível) + execução real no Windows (só lê o alvo
 * SINTÉTICO do ambiente isolado; em outros sistemas a execução é pulada).
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const SCRIPT = path.resolve(import.meta.dir, "..", "..", "scripts", "ler-credencial-isolada.ps1");
const fonte = readFileSync(SCRIPT, "utf8");
const codigo = fonte
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");
const ALVO_ISOLADO = "com.mariela.backoffice.isolado:sessao:v1";
const naWindows = process.platform === "win32";

function executar(args: string[] = []) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
    { encoding: "utf8", timeout: 60_000 },
  );
}

describe("leitor restrito — código", () => {
  test("alvo FIXO e exclusivamente o sintético; nenhuma referência ao alvo oficial", () => {
    expect(codigo).toContain(`$ALVO = '${ALVO_ISOLADO}'`);
    expect(codigo).not.toContain("com.mariela.backoffice:sessao:v1");
    expect(codigo).not.toMatch(/\bparam\s*\(/i); // sem parâmetros
    expect(codigo).toContain("if ($args.Count -gt 0)"); // recusa argumentos
  });

  test("somente leitura: só CredReadW/CredFree", () => {
    expect(codigo).toContain("CredReadW");
    for (const proibido of ["CredWrite", "CredDelete", "CredEnumerate", "cmdkey"]) {
      expect(codigo).not.toContain(proibido);
    }
  });

  test("o resumo nunca inclui tokens, chave, vínculo ou conteúdo", () => {
    const chavesDoResumo = [
      ...new Set([...codigo.matchAll(/\$resumo\.(\w+)\s*=/g)].map((m) => m[1])),
    ];
    expect(chavesDoResumo.sort()).toEqual(
      [
        "bytes",
        "campos",
        "estruturaValida",
        "formatoVersao",
        "pendencia",
        "refreshSha256Prefixo",
        "ultimaGravacao",
        "usuarioConfere",
      ].sort(),
    );
    // O prefixo é de 4 bytes (8 hex) do SHA-256 — nunca o token.
    expect(codigo).toContain("$hash[0..3]");
  });
});

describe.if(naWindows)("leitor restrito — execução real (Windows)", () => {
  test("recusa QUALQUER argumento (inclusive o alvo oficial) sem ler nada", () => {
    const r = executar(["com.mariela.backoffice:sessao:v1"]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("RECUSADO");
  });

  test("sem argumentos: devolve só o resumo estrutural do alvo sintético", () => {
    const r = executar();
    expect(r.status).toBe(0);
    const resumo = JSON.parse(r.stdout.trim());
    expect(resumo.alvo).toBe(ALVO_ISOLADO);
    expect(typeof resumo.existe).toBe("boolean");
    for (const sensivel of [
      'accessToken":',
      'refreshToken":',
      "mock-token",
      "mock-refresh-token",
    ]) {
      expect(r.stdout).not.toContain(sensivel);
    }
  });
});
