export type TipoUsuario = "ADMIN";

export interface Usuario {
  id: string;
  /** Código sequencial gerado pela API (`USR-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  email: string;
  tipo: TipoUsuario;
  ativo: boolean;
}

export interface LoginRequest {
  usuario: string;
  senha: string;
}

export interface LoginResponse {
  accessToken: string;
  /** Token opaco de renovação — usado só por `POST /auth/refresh`, nunca enviado como Bearer. */
  refreshToken: string;
  /** Validade do accessToken em segundos, a partir do momento da resposta. */
  expiresIn: number;
  usuario: Usuario;
}

/** Resposta de `POST /auth/refresh` — mesmo formato de `LoginResponse` (rotação: novo par de tokens a cada renovação). */
export type RefreshResponse = LoginResponse;
