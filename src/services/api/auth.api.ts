import { apiClient, renovacaoEmAndamentoDaSessao } from "./client";
import { limparSessao, refreshTokenStorage, salvarSessao } from "@/services/auth/token-storage";
import { invalidarGeracaoDaSessao } from "@/services/auth/session";
import { persistirLoginNativo, registrarEncerramentoNativo } from "@/services/auth/sessao-nativa";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>("/auth/login", payload);
    // Fase 22.8.4 (A2) — sessão NOVA: qualquer renovação ainda em andamento de uma sessão anterior é descartada ao
    // terminar, em vez de sobrescrever os tokens deste login.
    invalidarGeracaoDaSessao();
    salvarSessao(data);
    // Fase 22.8.8.4 (M4) — no desktop, a sessão nova é gravada no Credential Manager e CONFIRMADA por releitura antes
    // de o login terminar. Se o cofre falhar, o app segue explicitamente em modo legado (sinalizado na interface) — a
    // sessão nova continua válida pelo armazenamento legado, que já foi gravado acima.
    await persistirLoginNativo();
    return data;
  },
  async me(): Promise<Usuario> {
    const { data } = await apiClient.get<Usuario>("/auth/me");
    return data;
  },
  /**
   * Logout com ordem determinística (Fase 22.8.4 — A2):
   *   1. (síncrono) captura o refresh token e a renovação em andamento, INVALIDA a geração e LIMPA a sessão local —
   *      o logout local vale imediatamente, sem depender do backend;
   *   2. aguarda a renovação que já estava no ar (limitada pelo timeout do cliente): a resposta dela é descartada pela
   *      geração, nunca gravada. Revogar antes disso faria o backend ver o refresh antigo como REUSO e revogar todas
   *      as sessões do usuário;
   *   3. revoga no servidor (melhor esforço — nunca lança) o refresh token local e, se a renovação tardia emitiu um
   *      novo, também esse.
   * Sem conexão, a revogação falha em silêncio e a sessão local continua encerrada; o refresh token permanece válido no
   * servidor até expirar (mesma semântica anterior). Nada aqui toca no `sessionStorage` (operações pendentes).
   */
  async logout(): Promise<void> {
    const refreshToken = refreshTokenStorage.get();
    const renovacao = renovacaoEmAndamentoDaSessao();
    invalidarGeracaoDaSessao();
    limparSessao();
    // M4: marca "encerrada" na hora (síncrono) e apaga a sessão do Credential Manager — mesmo que apagar falhe, a
    // próxima abertura não restaura a sessão antiga.
    void registrarEncerramentoNativo();

    const aRevogar: string[] = [];
    if (refreshToken) aRevogar.push(refreshToken);
    if (renovacao) {
      const resultado = await renovacao;
      if (resultado.tipo === "descartada" && resultado.refreshTokenEmitido) {
        aRevogar.push(resultado.refreshTokenEmitido);
      }
    }
    for (const token of aRevogar) {
      try {
        await apiClient.post("/auth/logout", { refreshToken: token });
      } catch {
        // Melhor esforço — a sessão local já foi encerrada acima.
      }
    }
  },
};
