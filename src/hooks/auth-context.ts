import { createContext } from "react";
import type { LoginRequest, Usuario } from "@/types/auth";

export interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

// Contexto isolado em módulo próprio: evita que o Fast Refresh recrie a
// identidade do contexto e faça o useAuth perder o provider durante o HMR.
export const AuthContext = createContext<AuthContextValue | null>(null);
