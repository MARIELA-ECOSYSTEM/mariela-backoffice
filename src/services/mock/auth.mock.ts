import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

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
const TOKEN = "mock-token";
/** Só precisa ser reconhecível pelo mock de refresh — nunca validado criptograficamente aqui. */
const REFRESH_TOKEN = "mock-refresh-token";
/** 15 min, mesmo padrão do backend real (`JWT_ACCESS_EXPIRES_IN`). */
const EXPIRES_IN_SEGUNDOS = 15 * 60;

function sessaoMock(): Pick<LoginResponse, "accessToken" | "refreshToken" | "expiresIn"> {
  return { accessToken: TOKEN, refreshToken: REFRESH_TOKEN, expiresIn: EXPIRES_IN_SEGUNDOS };
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

      const data: LoginResponse = { ...sessaoMock(), usuario: USUARIO_ADMIN };
      return { data };
    },
    { requiresAuth: false },
  );

  registerMock("GET", "/auth/me", () => ({ data: USUARIO_ADMIN }));

  /** Sempre "renova" com sucesso enquanto o refresh token for o reconhecido pelo mock — sem rotação real, sem revogação. */
  registerMock(
    "POST",
    "/auth/refresh",
    ({ body }) => {
      const payload = (body ?? {}) as Partial<{ refreshToken: string }>;
      if (payload.refreshToken !== REFRESH_TOKEN) {
        throw ApiError.unauthorized("Sessão expirada. Faça login novamente.");
      }
      const data: LoginResponse = { ...sessaoMock(), usuario: USUARIO_ADMIN };
      return { data };
    },
    { requiresAuth: false },
  );

  /** Idempotente, como o backend real — nunca falha por token ausente/desconhecido. */
  registerMock("POST", "/auth/logout", () => ({ data: { ok: true } }), { requiresAuth: false });
}
