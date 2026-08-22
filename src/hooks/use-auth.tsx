import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/services/api/auth.api";
import { getToken } from "@/services/api/client";
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

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!getToken()) {
        if (ativo) setCarregando(false);
        return;
      }
      try {
        const atual = await authApi.me();
        if (ativo) setUsuario(atual);
      } catch {
        authApi.logout();
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const resultado = await authApi.login(payload);
    setUsuario(resultado.usuario);
  }, []);

  const logout = useCallback(async () => {
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
