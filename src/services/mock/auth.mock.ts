import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

const USUARIO_ADMIN: Usuario = { id: "usr_001", nome: "Administrador", tipo: "ADMIN" };
const CREDENCIAIS = { usuario: "admin", senha: "123456" };
const TOKEN = "mock-token";

export function registerAuthMocks(): void {
  registerMock(
    "POST",
    "/auth/login",
    ({ body }) => {
      const payload = (body ?? {}) as Partial<LoginRequest>;
      const errors = [];
      if (!payload.usuario) errors.push({ field: "usuario", message: "Usuário é obrigatório." });
      if (!payload.senha) errors.push({ field: "senha", message: "Senha é obrigatória." });
      if (errors.length) throw ApiError.validation("Dados inválidos.", errors);

      if (payload.usuario !== CREDENCIAIS.usuario || payload.senha !== CREDENCIAIS.senha) {
        throw ApiError.unauthorized("Usuário ou senha inválidos.");
      }

      const data: LoginResponse = { accessToken: TOKEN, usuario: USUARIO_ADMIN };
      return { data };
    },
    { requiresAuth: false },
  );

  registerMock("GET", "/auth/me", () => ({ data: USUARIO_ADMIN }));
}
