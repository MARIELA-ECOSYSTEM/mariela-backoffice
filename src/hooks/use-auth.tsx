import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "@/services/api/auth.api";
import { getToken } from "@/services/api/client";
import type { LoginRequest, Usuario } from "@/types/auth";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

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

  const logout = useCallback(() => {
    authApi.logout();
    setUsuario(null);
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
