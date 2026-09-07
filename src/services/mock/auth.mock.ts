import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import type { LoginRequest, SessaoResponse, Usuario } from "@/types/auth";

const USUARIO_ADMIN: Usuario = { id: "usr_001", nome: "Administrador", tipo: "ADMIN" };

/**
 * Credenciais do ambiente MOCK vêm exclusivamente de variáveis de ambiente
 * (`VITE_MOCK_LOGIN` / `VITE_MOCK_SENHA`) — nunca de componentes React.
 * O fallback mantém o acesso local de desenvolvimento.
 */
const CREDENCIAIS = {
  usuario: ((import.meta.env["VITE_MOCK_LOGIN"] as string | undefined) ?? "admin").trim(),
  senha: ((import.meta.env["VITE_MOCK_SENHA"] as string | undefined) ?? "123456").trim(),
};
const ACCESS_TOKEN = "mock-access-token";
const REFRESH_TOKEN = "mock-refresh-token";
const EXPIRES_IN = 900;

function sessao(): SessaoResponse {
  return {
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresIn: EXPIRES_IN,
    usuario: USUARIO_ADMIN,
  };
}

export function registerAuthMocks(): void {
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

      return { data: sessao() };
    },
    { requiresAuth: false },
  );

  // O mock não simula expiração/rotação real — um token fixo é suficiente
  // para exercitar o CAMINHO (o app chamar `/auth/refresh` e receber um par
  // válido de volta); a rotação de verdade só existe contra o backend real.
  registerMock(
    "POST",
    "/auth/refresh",
    ({ body }) => {
      const refreshToken = (body as { refreshToken?: string } | undefined)?.refreshToken;
      if (refreshToken !== REFRESH_TOKEN) {
        throw new ApiError({
          statusCode: 401,
          code: "REFRESH_TOKEN_INVALID",
          message: "Sessão expirada. Faça login novamente.",
        });
      }
      return { data: sessao() };
    },
    { requiresAuth: false },
  );

  registerMock("POST", "/auth/logout", () => ({ data: { ok: true } }), { requiresAuth: false });

  registerMock("GET", "/auth/me", () => ({ data: USUARIO_ADMIN }));
}
