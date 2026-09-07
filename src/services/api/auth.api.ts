import { apiClient, getRefreshToken, setAccessToken, setRefreshToken } from "./client";
import type { LoginRequest, SessaoResponse, Usuario } from "@/types/auth";

export const authApi = {
  async login(payload: LoginRequest): Promise<SessaoResponse> {
    const { data } = await apiClient.post<SessaoResponse>("/auth/login", payload);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return data;
  },

  /**
   * Renovação explícita (fora do fluxo automático de 401 do `apiClient`, que já
   * cobre praticamente todo caso de uso) — usada na restauração de sessão ao
   * abrir o app quando só existe refresh token salvo (ver `use-auth.tsx`).
   */
  async refresh(): Promise<SessaoResponse> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new Error("Não há refresh token salvo para renovar a sessão.");
    }
    const { data } = await apiClient.post<SessaoResponse>("/auth/refresh", { refreshToken });
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return data;
  },

  async me(): Promise<Usuario> {
    const { data } = await apiClient.get<Usuario>("/auth/me");
    return data;
  },

  /**
   * Encerra a sessão NO SERVIDOR (revoga o refresh token) — best-effort:
   * se o backend estiver fora do ar ou o token já não existir mais, ainda
   * assim resolve normalmente. Quem limpa o storage local e redireciona é
   * `encerrarSessao` (`services/auth/session.ts`), sempre chamado logo em
   * seguida — nunca depender do access token aqui, ele pode já estar expirado.
   */
  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return;
    try {
      await apiClient.post("/auth/logout", { refreshToken });
    } catch {
      // Best-effort: a sessão local será encerrada de qualquer forma.
    }
  },
};
