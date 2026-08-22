export type TipoUsuario = "ADMIN";

export interface Usuario {
  id: string;
  nome: string;
  tipo: TipoUsuario;
}

export interface LoginRequest {
  usuario: string;
  senha: string;
}

export interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}
