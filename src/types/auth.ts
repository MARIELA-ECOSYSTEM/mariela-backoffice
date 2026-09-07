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

/**
 * Formato devolvido tanto por `POST /auth/login` quanto por `POST /auth/refresh`
 * (o backend real reemite os dois tokens em ambos). `usuario` preserva
 * exatamente o formato já usado pelo Backoffice (`id`, `nome`, `tipo`) — o
 * backend usa `email`/`role` internamente, mas isso nunca chega até aqui.
 */
export interface SessaoResponse {
  accessToken: string;
  refreshToken: string;
  /** Segundos até o access token expirar (hoje não usado no frontend — a renovação é reativa, por 401). */
  expiresIn: number;
  usuario: Usuario;
}
