import { registerMock } from "./mock-transport";
import { armazenamentoPadraoMock, criarSessoesMock } from "./auth-sessoes.mock";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

/**
 * Credenciais do ambiente MOCK vêm exclusivamente de variáveis de ambiente
 * (`VITE_MOCK_LOGIN` / `VITE_MOCK_SENHA`) — nunca de componentes React.
 * O fallback mantém o acesso local de desenvolvimento.
 */
const CREDENCIAIS = {
  usuario: ((import.meta.env.VITE_MOCK_LOGIN as string | undefined) ?? "admin").trim(),
  senha: ((import.meta.env.VITE_MOCK_SENHA as string | undefined) ?? "123456").trim(),
};

const USUARIO_ADMIN: Usuario = {
  id: "usr_001",
  codigo: "USR-0001",
  nome: "Administrador",
  email: CREDENCIAIS.usuario,
  tipo: "ADMIN",
  ativo: true,
};
export function registerAuthMocks(): void {
  // Fase 22.8.8.8.2 (M8.2): rotação e recuperação idempotente com o contrato do backend real (`auth-sessoes.mock.ts`).
  const sessoes = criarSessoesMock(armazenamentoPadraoMock());

  registerMock(
    "POST",
    "/auth/login",
    ({ body }) => {
      const payload = (body ?? {}) as Partial<LoginRequest>;
      const errors: ApiFieldError[] = [];
      if (!payload.usuario) errors.push({ field: "usuario", message: "Usuário é obrigatório." });
      if (!payload.senha) errors.push({ field: "senha", message: "Senha é obrigatória." });
      if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

      const usuarioInformado = (payload.usuario ?? "").trim().toLowerCase();
      if (
        usuarioInformado !== CREDENCIAIS.usuario.toLowerCase() ||
        payload.senha !== CREDENCIAIS.senha
      ) {
        throw ApiError.unauthorized("Usuário ou senha inválidos.");
      }

      const data: LoginResponse = { ...sessoes.login(), usuario: USUARIO_ADMIN };
      return { data };
    },
    { requiresAuth: false },
  );

  registerMock("GET", "/auth/me", () => ({ data: USUARIO_ADMIN }));

  /** Rotação do refresh token; repetição da MESMA operação (`Idempotency-Key`) recupera o mesmo sucessor. */
  registerMock(
    "POST",
    "/auth/refresh",
    ({ body, headers }) => {
      const payload = (body ?? {}) as Partial<{ refreshToken: unknown }>;
      const data: LoginResponse = {
        ...sessoes.refresh(payload.refreshToken, headers),
        usuario: USUARIO_ADMIN,
      };
      return { data };
    },
    { requiresAuth: false },
  );

  /** Idempotente, como o backend real — nunca falha por token ausente/desconhecido. */
  registerMock(
    "POST",
    "/auth/logout",
    ({ body }) => {
      sessoes.logout(((body ?? {}) as Partial<{ refreshToken: unknown }>).refreshToken);
      return { data: { ok: true } };
    },
    { requiresAuth: false },
  );
}
