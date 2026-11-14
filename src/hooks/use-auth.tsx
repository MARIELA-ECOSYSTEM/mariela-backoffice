import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/services/api/auth.api";
import { mensagemDeErro } from "@/services/api/client";
import { encerrarSessao, registerSessionHandlers } from "@/services/auth/session";
import { restaurarSessao } from "@/services/auth/restaurar-sessao";
import {
  AuthContext,
  type AuthContextValue,
  type FalhaValidacaoSessao,
} from "@/hooks/auth-context";
import type { LoginRequest, Usuario } from "@/types/auth";

const MSG_INDISPONIVEL =
  "O servidor está temporariamente indisponível. Sua sessão foi mantida neste computador — tente novamente em instantes.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhaValidacao, setFalhaValidacao] = useState<FalhaValidacaoSessao | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  /** Só o resultado da validação MAIS RECENTE é aplicado (StrictMode, nova tentativa, desmontagem). */
  const validacaoAtual = useRef(0);

  // Handlers globais de encerramento de sessão (logout manual e rejeição definitiva).
  useEffect(() => {
    registerSessionHandlers({
      limparUsuario: () => {
        setUsuario(null);
        setFalhaValidacao(null);
      },
      limparCache: async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
      },
      irParaLogin: () => void navigate({ to: "/login", replace: true }),
      rotaAtual: () => router.state.location.pathname,
    });
    return () => registerSessionHandlers(null);
  }, [navigate, queryClient, router]);

  /**
   * Fase 22.8.4 (A1) — valida a sessão preservada. Indisponibilidade ou erro não classificado NÃO derrubam a sessão
   * nem revogam o refresh token: o estado vira "não validada" (tokens intactos) com nova tentativa manual. Uma rejeição
   * definitiva já foi encerrada pelo cliente HTTP (limpeza + /login).
   */
  const validar = useCallback(async () => {
    const id = ++validacaoAtual.current;
    setCarregando(true);
    setFalhaValidacao(null);
    const resultado = await restaurarSessao();
    if (id !== validacaoAtual.current) return;
    if (resultado.tipo === "autenticada") {
      setUsuario(resultado.usuario);
    } else if (resultado.tipo === "nao_validada") {
      setFalhaValidacao({
        indisponivel: resultado.motivo === "indisponivel",
        mensagem:
          resultado.motivo === "indisponivel"
            ? MSG_INDISPONIVEL
            : `Não foi possível validar sua sessão: ${mensagemDeErro(resultado.erro, "erro inesperado")} Sua sessão foi mantida — tente novamente ou saia.`,
      });
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void validar();
    return () => {
      validacaoAtual.current += 1; // desmontagem: descarta o resultado pendente.
    };
  }, [validar]);

  const login = useCallback(async (payload: LoginRequest) => {
    const resultado = await authApi.login(payload);
    validacaoAtual.current += 1; // uma validação antiga ainda no ar não altera a sessão recém-aberta.
    setFalhaValidacao(null);
    setCarregando(false);
    setUsuario(resultado.usuario);
  }, []);

  const logout = useCallback(async () => {
    // A parte síncrona de `authApi.logout` já invalida a geração e limpa os tokens; a revogação remota segue em
    // paralelo à limpeza da interface — o logout local nunca espera o backend.
    const revogacao = authApi.logout();
    validacaoAtual.current += 1; // uma validação em andamento não restaura o usuário depois do logout.
    setCarregando(false);
    await encerrarSessao({ redirecionar: true });
    await revogacao;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      carregando,
      autenticado: usuario !== null,
      falhaValidacao,
      revalidarSessao: validar,
      login,
      logout,
    }),
    [usuario, carregando, falhaValidacao, validar, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return ctx;
}
