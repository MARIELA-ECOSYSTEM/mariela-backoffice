/**
 * Fase 22.8.4 (A1) — recuperação da sessão na abertura do aplicativo, separada do React para ser testável.
 *
 * Antes, QUALQUER erro de `/auth/me` (offline, timeout, backend acordando, 5xx) acionava o logout, que revogava no
 * servidor um refresh token ainda válido. Agora a sessão só termina com evidência de rejeição definitiva — e quem a
 * encerra é o próprio cliente HTTP (`client.ts`: 401 → renovação → `REFRESH_TOKEN_INVALID`/`REUSED`/`USER_INACTIVE`).
 * Aqui nada é revogado nem limpo.
 */
import { authApi } from "@/services/api/auth.api";
import { classificarFalhaDeAutenticacao, getToken } from "@/services/api/client";
import { geracaoDaSessao } from "@/services/auth/session";
import type { Usuario } from "@/types/auth";

export type ResultadoRestauracao =
  /** Não havia sessão local. */
  | { tipo: "sem_sessao" }
  /** `/auth/me` confirmou a sessão. */
  | { tipo: "autenticada"; usuario: Usuario }
  /** A sessão terminou durante a validação (rejeição definitiva já tratada pelo cliente HTTP, ou logout/login). */
  | { tipo: "encerrada" }
  /**
   * Sessão AINDA NÃO VALIDADA: tokens preservados, nada revogado. `indisponivel` = rede/timeout/502/503/504;
   * `desconhecido` = outra resposta sem evidência de que a sessão expirou.
   */
  | { tipo: "nao_validada"; motivo: "indisponivel" | "desconhecido"; erro: unknown };

export async function restaurarSessao(): Promise<ResultadoRestauracao> {
  if (!getToken()) return { tipo: "sem_sessao" };
  const geracao = geracaoDaSessao();
  try {
    const usuario = await authApi.me();
    if (geracaoDaSessao() !== geracao) return { tipo: "encerrada" };
    return { tipo: "autenticada", usuario };
  } catch (erro) {
    if (geracaoDaSessao() !== geracao || !getToken()) return { tipo: "encerrada" };
    const motivo =
      classificarFalhaDeAutenticacao(erro) === "temporaria" ? "indisponivel" : "desconhecido";
    return { tipo: "nao_validada", motivo, erro };
  }
}
