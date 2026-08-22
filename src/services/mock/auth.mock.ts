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

      const data: LoginResponse = { accessToken: TOKEN, usuario: USUARIO_ADMIN };
      return { data };
    },
    { requiresAuth: false },
  );

  registerMock("GET", "/auth/me", () => ({ data: USUARIO_ADMIN }));
}
