import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config PRÓPRIA (não `vite.config.ts`) de propósito: o projeto usa
 * `@lovable.dev/vite-tanstack-config`, que já registra plugins (TanStack
 * Start, Nitro, etc.) pensados para servir a aplicação — não para coletar
 * testes. Um arquivo dedicado evita qualquer risco de interferência com
 * aquele setup gerenciado, e reusa `vite-tsconfig-paths` (já uma dependência
 * do projeto) só para resolver o alias `@/*` exatamente como o app real.
 *
 * Não existia NENHUM framework de teste no frontend antes desta etapa —
 * Vitest foi escolhido por ser o padrão de fato para projetos Vite (zero
 * configuração extra de TS/JSX, reaproveita o resolvedor de módulos do Vite).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
