import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type EstadoUpdater =
  | "verificando"
  | "atualizado"
  | "disponivel"
  | "baixando"
  | "instalando"
  | "erro";

export interface UpdaterStatus {
  estado: EstadoUpdater;
  versaoAtual: string | null;
  versaoDisponivel: string | null;
  /** 0–100 quando o tamanho do download é conhecido; `null` quando indeterminado. */
  progresso: number | null;
  erro: string | null;
  atualizarAgora: () => void;
  tentarNovamente: () => void;
}

/**
 * Verificação e instalação de atualizações via o plugin oficial do Tauri
 * (`@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`).
 *
 * Fora do app empacotado (ex.: `vite dev`/preview no navegador) não existe
 * ponte Tauri — `check()`/`getVersion()` rejeitam, e isso é tratado como
 * estado "erro" normal, nunca como crash: a tela de login nunca deve ser
 * bloqueada por isso.
 *
 * A assinatura/integridade do pacote é verificada pelo mecanismo interno do
 * plugin — nenhuma lógica própria de verificação é implementada aqui.
 */
export function useUpdaterStatus(): UpdaterStatus {
  const [estado, setEstado] = useState<EstadoUpdater>("verificando");
  const [versaoAtual, setVersaoAtual] = useState<string | null>(null);
  const [versaoDisponivel, setVersaoDisponivel] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Guarda o recurso do Tauri (`Update extends Resource`) para poder
  // `.close()` quando não for usado, e os refs evitam checagens/ações
  // concorrentes (StrictMode, remontagem da tela, cliques repetidos).
  const updateRef = useRef<Update | null>(null);
  const verificacaoEmAndamento = useRef(false);
  const acaoEmAndamento = useRef(false);

  const verificar = useCallback(() => {
    if (verificacaoEmAndamento.current) return;
    verificacaoEmAndamento.current = true;
    setEstado("verificando");
    setErro(null);

    void (async () => {
      try {
        const versao = await getVersion();
        setVersaoAtual(versao);

        if (updateRef.current) {
          await updateRef.current.close().catch(() => undefined);
          updateRef.current = null;
        }

        const resultado = await check();
        if (resultado) {
          updateRef.current = resultado;
          setVersaoDisponivel(resultado.version);
          setEstado("disponivel");
        } else {
          setVersaoDisponivel(null);
          setEstado("atualizado");
        }
      } catch (e) {
        console.error("[updater] Falha ao verificar atualizações:", e);
        setEstado("erro");
        setErro("Não foi possível verificar se há uma nova versão agora.");
      } finally {
        verificacaoEmAndamento.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    verificar();
    return () => {
      // Libera o recurso do updater se a tela de login desmontar (ex.: login
      // concluído) antes do administrador decidir atualizar.
      if (updateRef.current) void updateRef.current.close().catch(() => undefined);
    };
    // Executa só uma vez, ao abrir a tela de login — `verificar` é estável ([]).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atualizarAgora = useCallback(() => {
    if (acaoEmAndamento.current) return;
    const atualizacao = updateRef.current;
    if (!atualizacao) return;

    acaoEmAndamento.current = true;
    setEstado("baixando");
    setProgresso(null);
    setErro(null);

    void (async () => {
      try {
        let tamanhoTotal = 0;
        let baixado = 0;
        await atualizacao.downloadAndInstall((evento) => {
          switch (evento.event) {
            case "Started":
              tamanhoTotal = evento.data.contentLength ?? 0;
              baixado = 0;
              setProgresso(tamanhoTotal > 0 ? 0 : null);
              break;
            case "Progress":
              baixado += evento.data.chunkLength;
              setProgresso(tamanhoTotal > 0 ? Math.min(100, Math.round((baixado / tamanhoTotal) * 100)) : null);
              break;
            case "Finished":
              setEstado("instalando");
              break;
          }
        });
        // No Windows, `downloadAndInstall` já encerra o app ao lançar o
        // instalador (comportamento documentado do plugin); `relaunch()`
        // cobre o caso de a reabertura não ser automática — mesmo padrão
        // do exemplo oficial do plugin updater.
        await relaunch();
      } catch (e) {
        console.error("[updater] Falha ao baixar/instalar a atualização:", e);
        setEstado("erro");
        setErro("Não foi possível concluir a atualização. Tente novamente mais tarde.");
        acaoEmAndamento.current = false;
      }
    })();
  }, []);

  const tentarNovamente = useCallback(() => {
    verificar();
  }, [verificar]);

  return { estado, versaoAtual, versaoDisponivel, progresso, erro, atualizarAgora, tentarNovamente };
}
