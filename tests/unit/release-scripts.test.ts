/**
 * Fase 22.8.9.9.11 — scripts do workflow de release (`scripts/release/*.mjs`): conferência tag × versão e vínculo da
 * publicação com a CI verde do MESMO commit. Sem rede: a API do GitHub é um `fetch` falso. Dados sintéticos.
 * Executar com: `bun test tests/unit`
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dir, "..", "..");
const versao = await import(path.join(RAIZ, "scripts", "release", "conferir-versao.mjs"));
const ci = await import(path.join(RAIZ, "scripts", "release", "verificar-ci-do-commit.mjs"));

const SHA = "65cdfc30218d5bbbcc291739f72867611ffba9fb";
const OUTRO = "617978642d099670b02604e8f864c96e49fda27f";

const execucao = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  run_number: 23,
  head_sha: SHA,
  event: "push",
  head_branch: "main",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
  ...extra,
});

const tauriConf = (v: string) => JSON.stringify({ productName: "MARIELA Backoffice", version: v });
const cargoToml = (v: string) =>
  `[package]\nname = "mariela-backoffice"\nversion = "${v}"\nrust-version = "1.77.2"\n\n[dependencies]\nserde = { version = "1.0" }\n`;
const cargoLock = (v: string) =>
  `[[package]]\nname = "aaa"\nversion = "9.9.9"\n\n[[package]]\nname = "mariela-backoffice"\nversion = "${v}"\ndependencies = []\n\n[[package]]\nname = "mariela-backoffice-extra"\nversion = "0.0.1"\n`;

describe("conferir-versao", () => {
  test("tag e os três arquivos iguais: nenhuma divergência", () => {
    expect(
      versao.conferirVersao("v0.1.5", {
        tauriConf: tauriConf("0.1.5"),
        cargoToml: cargoToml("0.1.5"),
        cargoLock: cargoLock("0.1.5"),
      }),
    ).toEqual([]);
  });

  test("qualquer arquivo divergente reprova, apontando o arquivo", () => {
    const erros = versao.conferirVersao("v0.1.5", {
      tauriConf: tauriConf("0.1.5"),
      cargoToml: cargoToml("0.1.4"),
      cargoLock: cargoLock("0.1.4"),
    });
    expect(erros).toHaveLength(2);
    expect(erros[0]).toContain("src-tauri/Cargo.toml: versão 0.1.4, mas a tag é v0.1.5");
    expect(erros[1]).toContain("src-tauri/Cargo.lock");
  });

  test("tag fora do formato vX.Y.Z reprova; package.json não entra na conferência", () => {
    for (const tag of ["0.1.5", "v0.1", "v0.1.5-beta", "", "v0.1.5 "]) {
      const r = versao.conferirVersao(tag, {
        tauriConf: tauriConf("0.1.5"),
        cargoToml: cargoToml("0.1.5"),
        cargoLock: cargoLock("0.1.5"),
      });
      if (tag === "v0.1.5 ")
        expect(r).toEqual([]); // espaço nas pontas é aparado
      else expect(r[0]).toContain("não está no formato vX.Y.Z");
    }
  });

  test("Cargo.toml: só a versão de [package] (não a de dependências); Cargo.lock: só o pacote exato", () => {
    expect(versao.versaoDoCargoToml(cargoToml("1.2.3"))).toBe("1.2.3");
    expect(versao.versaoDoCargoToml('[dependencies]\nx = { version = "1.0" }\n')).toBeNull();
    expect(versao.versaoDoCargoLock(cargoLock("1.2.3"))).toBe("1.2.3");
    expect(versao.versaoDoCargoLock(cargoLock("1.2.3"), "inexistente")).toBeNull();
    expect(versao.versaoDoCargoToml(cargoToml("1.2.3").replace(/\n/g, "\r\n"))).toBe("1.2.3");
  });

  test("os arquivos REAIS do repositório estão sincronizados entre si", () => {
    const ler = (r: string) => readFileSync(path.join(RAIZ, r), "utf8");
    const atual = JSON.parse(ler("src-tauri/tauri.conf.json")).version as string;
    expect(
      versao.conferirVersao(`v${atual}`, {
        tauriConf: ler("src-tauri/tauri.conf.json"),
        cargoToml: ler("src-tauri/Cargo.toml"),
        cargoLock: ler("src-tauri/Cargo.lock"),
      }),
    ).toEqual([]);
  });
});

describe("instalador único (NSIS) — Fase 22.8.9.9.23", () => {
  const ler = (r: string) => readFileSync(path.join(RAIZ, r), "utf8");
  const conf = JSON.parse(ler("src-tauri/tauri.conf.json"));
  const workflow = Bun.YAML.parse(ler(".github/workflows/release.yml")) as {
    jobs: { publicar: { steps: { uses?: string; with?: Record<string, unknown> }[] } };
  };

  test("tauri.conf.json: só NSIS, por usuário; nenhuma configuração de MSI (WiX)", () => {
    expect(conf.bundle.targets).toEqual(["nsis"]);
    expect(conf.bundle.windows.nsis.installMode).toBe("currentUser");
    expect(conf.bundle.windows).not.toHaveProperty("wix");
  });

  test("identidade e WebView2 preservados", () => {
    expect(conf.identifier).toBe("com.mariela.backoffice");
    // Sem `webviewInstallMode`: continua o padrão do Tauri (igual às versões anteriores).
    expect(conf.bundle.windows).not.toHaveProperty("webviewInstallMode");
  });

  test("release.yml: o build da release gera só o pacote NSIS", () => {
    const tauri = workflow.jobs.publicar.steps.find((p) =>
      p.uses?.startsWith("tauri-apps/tauri-action@"),
    );
    expect(tauri?.with?.args).toBe("--bundles nsis");
  });

  test("o aviso de nova versão do app aponta para o `-setup.exe`", () => {
    expect(ler("src/hooks/use-updater.ts")).toContain('asset.name.endsWith("-setup.exe")');
  });
});

describe("verificar-ci-do-commit", () => {
  test("CI concluída com sucesso para o MESMO SHA, push em main: aprovado", () => {
    expect(ci.avaliarExecucoes([execucao()], SHA).estado).toBe("aprovado");
  });

  test("execução de OUTRO SHA (mesmo verde) nunca autoriza", () => {
    const r = ci.avaliarExecucoes([execucao({ head_sha: OUTRO })], SHA);
    expect(r.estado).toBe("ausente");
  });

  test("evento, branch ou workflow diferentes não contam (PR, outra branch, release)", () => {
    for (const extra of [
      { event: "pull_request" },
      { head_branch: "outra" },
      { path: ".github/workflows/release.yml" },
    ]) {
      expect(ci.avaliarExecucoes([execucao(extra)], SHA).estado).toBe("ausente");
    }
  });

  test("vale a execução MAIS RECENTE do commit: falha nova não é mascarada por sucesso antigo", () => {
    const r = ci.avaliarExecucoes(
      [execucao({ run_number: 23 }), execucao({ id: 2, run_number: 24, conclusion: "failure" })],
      SHA,
    );
    expect(r.estado).toBe("reprovado");
    expect(r.motivo).toContain("failure");
  });

  test("em andamento: aguarda; concluída com falha/cancelada: reprova", () => {
    expect(
      ci.avaliarExecucoes([execucao({ status: "in_progress", conclusion: null })], SHA).estado,
    ).toBe("aguardar");
    for (const conclusion of ["failure", "cancelled", "timed_out", "skipped"]) {
      expect(ci.avaliarExecucoes([execucao({ conclusion })], SHA).estado).toBe("reprovado");
    }
  });

  test("SHA abreviado ou inválido reprova (só SHA completo)", () => {
    expect(ci.avaliarExecucoes([execucao()], "65cdfc3").estado).toBe("reprovado");
  });

  test("a consulta filtra por SHA, push e main; o token vai só no cabeçalho", async () => {
    const vistos: { url: string; auth: string | undefined }[] = [];
    const fetchFalso = async (url: string, init: { headers: Record<string, string> }) => {
      vistos.push({ url, auth: init.headers.Authorization });
      return new Response(JSON.stringify({ workflow_runs: [execucao()] }), { status: 200 });
    };
    const r = await ci.buscarExecucoes({
      repositorio: "dono/repo",
      sha: SHA,
      token: "tk",
      fetchImpl: fetchFalso,
    });
    expect(r).toHaveLength(1);
    expect(vistos[0]!.url).toBe(
      `https://api.github.com/repos/dono/repo/actions/workflows/ci.yml/runs?head_sha=${SHA}&event=push&branch=main&per_page=50`,
    );
    expect(vistos[0]!.auth).toBe("Bearer tk");
  });

  test("aguardarCiVerde: espera a CI terminar e aprova; sem CI dentro do prazo, reprova", async () => {
    let t = 0;
    const respostas = [
      { workflow_runs: [] },
      { workflow_runs: [execucao({ status: "in_progress", conclusion: null })] },
      { workflow_runs: [execucao()] },
    ];
    const fetchSeq = async () => new Response(JSON.stringify(respostas.shift()), { status: 200 });
    const base = {
      repositorio: "d/r",
      sha: SHA,
      agora: () => t,
      dormir: async (ms: number) => void (t += ms),
      log: () => {},
    };
    expect((await ci.aguardarCiVerde({ ...base, fetchImpl: fetchSeq })).estado).toBe("aprovado");

    t = 0;
    const vazio = async () => new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
    const r = await ci.aguardarCiVerde({ ...base, fetchImpl: vazio, prazoAusenteMs: 60_000 });
    expect(r.estado).toBe("reprovado");
    expect(r.motivo).toContain("Prazo de espera esgotado");
  });

  test("erro da API (ex.: 403) não aprova: tenta de novo dentro do prazo e reprova ao esgotar", async () => {
    let t = 0;
    const erro = async () => new Response("{}", { status: 403 });
    const r = await ci.aguardarCiVerde({
      repositorio: "d/r",
      sha: SHA,
      fetchImpl: erro,
      agora: () => t,
      dormir: async (ms: number) => void (t += ms),
      prazoMs: 90_000,
      log: () => {},
    });
    expect(r.estado).toBe("reprovado");
  });
});
