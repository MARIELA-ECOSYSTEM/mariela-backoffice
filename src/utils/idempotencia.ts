/**
 * Geração da `idempotencyKey` enviada em mutações financeiras (Etapa 18.30).
 *
 * Gerar SEMPRE no ponto onde o payload final é montado, uma única vez por
 * tentativa real (clique/submit) — nunca dentro de `mutationFn` ou do
 * `apiClient`. Um retry automático (renovação de token, timeout) reenvia o
 * MESMO objeto de payload já montado, preservando a mesma chave; um novo
 * clique do usuário chama este helper de novo e gera uma chave nova.
 */
export function gerarIdempotencyKey(): string {
  return crypto.randomUUID();
}
