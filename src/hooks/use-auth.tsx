import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/services/api/auth.api";
import { getAccessToken, getRefreshToken } from "@/services/api/client";
import { encerrarSessao, registerSessionHandlers } from "@/services/auth/session";
import { AuthContext, type AuthContextValue } from "@/hooks/auth-context";
import type { LoginRequest, Usuario } from "@/types/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();

  // Handlers globais de encerramento de sessão (logout manual e HTTP 401).
  useEffect(() => {
    registerSessionHandlers({
      limparUsuario: () => setUsuario(null),
      limparCache: async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
      },
      irParaLogin: () => void navigate({ to: "/login", replace: true }),
      rotaAtual: () => router.state.location.pathname,
    });
    return () => registerSessionHandlers(null);
  }, [navigate, queryClient, router]);

  // Restauração da sessão ao abrir o app.
  //
  // Basta existir QUALQUER token salvo (access OU refresh) para tentar
  // `/auth/me` — se o access token estiver expirado, o mecanismo automático
  // de renovação do `apiClient` (ver `client.ts`) já cuida de renovar e
  // repetir a chamada sozinho; esta função não duplica essa lógica.
  useEffect(() => {
    let ativo = true;
    async function restaurar() {
      if (!getAccessToken() && !getRefreshToken()) {
        if (ativo) setCarregando(false);
        return;
      }
      try {
        const atual = await authApi.me();
        if (ativo) setUsuario(atual);
      } catch {
        // Se o erro foi 401 e a renovação automática também falhou, o
        // `apiClient` já encerrou a sessão (limpou tokens e redirecionou) —
        // nada a fazer aqui. Se foi outro erro (rede, por exemplo), os
        // tokens salvos são preservados: não deslogar por uma falha
        // transitória, só não autenticar nesta carga do app.
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void restaurar();
    return () => {
      ativo = false;
    };
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const resultado = await authApi.login(payload);
    setUsuario(resultado.usuario);
  }, []);

  const logout = useCallback(async () => {
    // Best-effort no servidor (revoga o refresh token) — nunca lança, então
    // a limpeza local/redirecionamento abaixo sempre acontece mesmo se o
    // backend estiver inacessível ou o access token já tiver expirado.
    await authApi.logout();
    await encerrarSessao({ redirecionar: true });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ usuario, carregando, autenticado: usuario !== null, login, logout }),
    [usuario, carregando, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return ctx;
}
