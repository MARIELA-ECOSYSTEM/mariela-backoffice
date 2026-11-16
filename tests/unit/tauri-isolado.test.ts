/**
 * Fase 22.8.8.7 (M7) — script do ambiente isolado (`scripts/tauri-isolado.mjs`) e configuração correspondente.
 * Executar com: `bun test tests/unit`
 *
 * Inclui execuções REAIS do script em diretórios temporários (todas terminam na recusa, antes de chamar o Tauri CLI).
 * Os arquivos `.env*` desses diretórios são criados VAZIOS pelo próprio teste; nenhum `.env` do projeto é lido.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dir, "..", "..");
const SCRIPT = path.join(RAIZ, "scripts", "tauri-isolado.mjs");
const {
  arquivosEnvProibidos,
  ambienteDoProcesso,
  argumentosTauri,
  CONFIG_ISOLADA,
  FEATURE_ISOLADA,
} = await import(SCRIPT);

const PRODUCAO = "mariela-backend.onrender.com";

describe("arquivos .env", () => {
  test("recusa .env, .env.local, .env.<modo> e variações de maiúsculas; tolera só o modelo .env.example", () => {
    const nomes = [
      ".env",
      ".env.local",
      ".env.development",
      ".env.development.local",
      ".env.production",
      ".ENV",
      ".Env.Local",
      ".env.example",
      ".env.example.local",
      "package.json",
      "src",
      "environment.ts",
    ];
    expect(arquivosEnvProibidos(nomes)).toEqual(
      [
        ".ENV",
        ".Env.Local",
        ".env",
        ".env.development",
        ".env.development.local",
        ".env.example.local",
        ".env.local",
        ".env.production",
      ].sort(),
    );
    expect(arquivosEnvProibidos([".env.example", "package.json"])).toEqual([]);
  });
});

describe("ambiente do processo", () => {
  test("Mock API obrigatória; nenhuma VITE_* herdada (URL de produção incluída) nem TAURI_CONFIG herdado", () => {
    const env = ambienteDoProcesso({
      PATH: "C:\\bin",
      VITE_API_URL: `https://${PRODUCAO}/api/v1`,
      VITE_USE_MOCK_API: "false",
      vite_api_url: `https://${PRODUCAO}/api/v1`,
      VITE_MOCK_SENHA: "x",
      TAURI_CONFIG: '{"identifier":"com.mariela.backoffice"}',
    });
    expect(env).toEqual({ PATH: "C:\\bin", VITE_USE_MOCK_API: "true" });
    expect(JSON.stringify(env)).not.toContain(PRODUCAO);
  });

  test("o script não define nenhuma URL de backend", () => {
    const fonte = readFileSync(SCRIPT, "utf8");
    expect(fonte).not.toContain("VITE_API_URL");
    expect(fonte).not.toMatch(/https?:\/\//);
  });
});

describe("argumentos do Tauri CLI", () => {
  test("sempre `tauri dev` com a configuração isolada e a feature; nunca build, release ou bundles", () => {
    const args = argumentosTauri();
    expect(args).toEqual([
      "run",
      "tauri",
      "dev",
      "--config",
      CONFIG_ISOLADA,
      "--features",
      FEATURE_ISOLADA,
    ]);
    for (const proibido of ["build", "--release", "--bundles", "bundle"])
      expect(args).not.toContain(proibido);
    expect(CONFIG_ISOLADA).toBe("src-tauri/tauri.isolado.conf.json");
    expect(FEATURE_ISOLADA).toBe("ambiente-isolado");
  });

  test("a configuração apontada é a isolada (identifier próprio, sem empacotamento)", () => {
    const config = JSON.parse(readFileSync(path.join(RAIZ, CONFIG_ISOLADA), "utf8"));
    expect(config.identifier).toBe("com.mariela.backoffice.isolado");
    expect(config.bundle).toEqual({ active: false });
  });

  test("package.json: `tauri:isolado` chama o script; os scripts oficiais não mudaram", () => {
    const pkg = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));
    expect(pkg.scripts["tauri:isolado"]).toBe("bun scripts/tauri-isolado.mjs");
    expect(pkg.scripts["tauri:build"]).toBe("tauri build");
    expect(pkg.scripts["build:desktop"]).toBe("cross-env BUILD_TARGET=desktop vite build");
    expect(pkg.scripts["tauri"]).toBe("tauri");
    for (const [nome, comando] of Object.entries(pkg.scripts as Record<string, string>)) {
      if (nome !== "tauri:isolado") expect(comando).not.toContain("isolado");
    }
  });
});

describe("execução real do script (recusas)", () => {
  function raizTemporaria(opcoes: { config?: boolean; env?: string[] }) {
    const dir = mkdtempSync(path.join(tmpdir(), "m7-isolado-"));
    writeFileSync(path.join(dir, "package.json"), "{}");
    if (opcoes.config !== false) {
      mkdirSync(path.join(dir, "src-tauri"));
      writeFileSync(path.join(dir, CONFIG_ISOLADA), "{}");
    }
    for (const nome of opcoes.env ?? []) writeFileSync(path.join(dir, nome), ""); // vazio, criado pelo teste
    return dir;
  }
  function executar(cwd: string, args: string[] = []) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
    });
  }

  for (const env of [[".env"], [".env.local"], [".env.development.local", ".env.example"]]) {
    test(`recusa com ${env.join(" + ")} na raiz, antes de chamar o Tauri CLI`, () => {
      const dir = raizTemporaria({ env });
      try {
        const r = executar(dir);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("RECUSADO");
        expect(r.stderr).toContain(env[0]!);
        expect(r.stdout).not.toContain("Ambiente ISOLADO"); // não chegou ao spawn
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test("recusa argumentos extras (ex.: --release)", () => {
    const dir = raizTemporaria({});
    try {
      const r = executar(dir, ["--release"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("não aceita argumentos");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("recusa fora da raiz do projeto (sem a configuração isolada)", () => {
    const dir = raizTemporaria({ config: false });
    try {
      const r = executar(dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("raiz do mariela-backoffice");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
