import { createContext } from "react";
import type { LoginRequest, Usuario } from "@/types/auth";

/**
 * Fase 22.8.4 — a sessão local existe (tokens preservados), mas a abertura não conseguiu validá-la: backend
 * indisponível (`indisponivel`) ou resposta sem evidência de expiração. Nada foi revogado.
 */
export interface FalhaValidacaoSessao {
  indisponivel: boolean;
  mensagem: string;
}

export interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  /** Preenchido só no estado "sessão ainda não validada"; `null` quando autenticado ou sem sessão. */
  falhaValidacao: FalhaValidacaoSessao | null;
  /** Nova tentativa manual de validar a sessão preservada (sem retry automático). */
  revalidarSessao: () => Promise<void>;
  login: (payload: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

// Contexto isolado em módulo próprio: evita que o Fast Refresh recrie a
// identidade do contexto e faça o useAuth perder o provider durante o HMR.
export const AuthContext = createContext<AuthContextValue | null>(null);
