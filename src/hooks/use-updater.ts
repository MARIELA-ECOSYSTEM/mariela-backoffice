import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

export type EstadoUpdater = "verificando" | "atualizado" | "disponivel" | "erro";

export interface UpdaterStatus {
  estado: EstadoUpdater;
  versaoAtual: string | null;
  versaoDisponivel: string | null;
  /** Notas da versão (corpo da release), quando disponíveis. */
  notas: string | null;
  erro: string | null;
  /** Abre o instalador da nova versão no navegador padrão. Nunca baixa/instala nada por aqui dentro. */
  baixarAgora: () => void;
  tentarNovamente: () => void;
}

const REPO = "MARIELA-ECOSYSTEM/mariela-backoffice";
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const TIMEOUT_MS = 8000;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  body: string | null;
  assets: GithubReleaseAsset[];
}

type Semver = readonly [number, number, number];

/** Extrai X.Y.Z de tags como "v0.2.0" ou "0.2.0" (ignora sufixo de pré-release, se houver). */
function parseVersao(valor: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(valor.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Comparação semântica (nunca lexicográfica): `a` é considerada mais nova que
 * `b` apenas por valor numérico de major/minor/patch — "0.10.0" > "0.9.0".
 */
function versaoMaisNova(a: Semver, b: Semver): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

/**
 * Verificação simples de atualização via a API pública de Releases do GitHub
 * (`GET /repos/.../releases/latest` — envia `Access-Control-Allow-Origin: *`,
 * diferente dos assets de download, que não enviam CORS e por isso não podem
 * ser lidos via `fetch()` direto). Não baixa nem instala nada: apenas abre o
 * instalador no navegador padrão do sistema via o plugin oficial `opener`,
 * para instalação manual pelo administrador.
 *
 * Nunca bloqueia o login: qualquer falha (rede, timeout, resposta inválida,
 * repositório sem releases ainda) cai no estado "erro" ou "atualizado",
 * nunca lança para fora do hook.
 */
export function useUpdaterStatus(): UpdaterStatus {
  const [estado, setEstado] = useState<EstadoUpdater>("verificando");
  const [versaoAtual, setVersaoAtual] = useState<string | null>(null);
  const [versaoDisponivel, setVersaoDisponivel] = useState<string | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const urlInstaladorRef = useRef<string | null>(null);
  const verificacaoEmAndamento = useRef(false);

  const verificar = useCallback(() => {
    if (verificacaoEmAndamento.current) return;
    verificacaoEmAndamento.current = true;
    setEstado("verificando");
    setErro(null);

    void (async () => {
      try {
        const versao = await getVersion();
        setVersaoAtual(versao);
        const atual = parseVersao(versao);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let resposta: Response;
        try {
          resposta = await fetch(RELEASES_API_URL, {
            headers: { Accept: "application/vnd.github+json" },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Repositório ainda sem nenhuma release publicada: nada a atualizar
        // (não é uma falha, é um estado válido e atual do projeto).
        if (resposta.status === 404) {
          urlInstaladorRef.current = null;
          setVersaoDisponivel(null);
          setNotas(null);
          setEstado("atualizado");
          return;
        }
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const release = (await resposta.json()) as GithubRelease;
        const disponivel = parseVersao(release.tag_name);
        const instalador = release.assets.find((asset) => asset.name.endsWith("-setup.exe"));

        if (!disponivel || !atual || !instalador || !versaoMaisNova(disponivel, atual)) {
          urlInstaladorRef.current = null;
          setVersaoDisponivel(null);
          setNotas(null);
          setEstado("atualizado");
          return;
        }

        urlInstaladorRef.current = instalador.browser_download_url;
        setVersaoDisponivel(release.tag_name.replace(/^v/, ""));
        setNotas(release.body?.trim() || null);
        setEstado("disponivel");
      } catch (e) {
        console.error("[updater] Falha ao verificar atualizações:", e);
        urlInstaladorRef.current = null;
        setEstado("erro");
        setErro("Não foi possível verificar se há uma nova versão agora.");
      } finally {
        verificacaoEmAndamento.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    verificar();
    // Executa só uma vez, ao abrir a tela de login — `verificar` é estável ([]).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baixarAgora = useCallback(() => {
    const url = urlInstaladorRef.current;
    if (!url) return;
    void openUrl(url).catch((e) => {
      console.error("[updater] Falha ao abrir o link do instalador:", e);
    });
  }, []);

  const tentarNovamente = useCallback(() => {
    verificar();
  }, [verificar]);

  return { estado, versaoAtual, versaoDisponivel, notas, erro, baixarAgora, tentarNovamente };
}
