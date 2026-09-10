import { apiClient } from "./client";
import { limparSessao, refreshTokenStorage, salvarSessao } from "@/services/auth/token-storage";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>("/auth/login", payload);
    salvarSessao(data);
    return data;
  },
  async me(): Promise<Usuario> {
    const { data } = await apiClient.get<Usuario>("/auth/me");
    return data;
  },
  /**
   * Revoga a sessão no servidor (melhor esforço — nunca lança) e SEMPRE limpa
   * a sessão local em seguida, mesmo sem conexão com a API: o logout precisa
   * funcionar para o usuário mesmo se o backend estiver fora do ar.
   */
  async logout(): Promise<void> {
    const refreshToken = refreshTokenStorage.get();
    try {
      if (refreshToken) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    } catch {
      // Melhor esforço — a limpeza local abaixo acontece de qualquer forma.
    } finally {
      limparSessao();
    }
  },
};
