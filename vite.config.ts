// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type Plugin } from "vite";

/**
 * Etapa 22 — falha o próprio `npm run build` (modo production) quando a
 * configuração de Mock/API real é inválida, em vez de só falhar quando o
 * bundle publicado roda pela primeira vez. Duplica (deliberadamente, não por
 * descuido) as duas condições de `src/services/api/client.ts`: aquele módulo
 * roda no bundle do navegador via `import.meta.env` (protege runtime/SSR);
 * este plugin roda em Node durante a resolução do build e precisa ler o
 * `.env` por conta própria via `loadEnv` — os dois juntos cobrem tanto
 * "o build nunca deveria ter sido publicado" quanto "o build publicado nunca
 * deveria rodar assim".
 */
function bloquearConfiguracaoInvalidaDeApi(): Plugin {
  return {
    name: "mariela:bloquear-configuracao-invalida-de-api",
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const mockEnv = env["VITE_USE_MOCK_API"]?.trim();
      const apiUrl = (env["VITE_API_URL"] ?? "").trim();
      const useMock = mockEnv === "true" || (mockEnv !== "false" && apiUrl === "");

      if (mode === "production" && useMock) {
        throw new Error(
          "Configuração de ambiente inválida: Mock API (VITE_USE_MOCK_API=true) não pode ser utilizada em produção. Defina VITE_USE_MOCK_API=false e VITE_API_URL antes de publicar.",
        );
      }
      if (!useMock && apiUrl === "") {
        throw new Error(
          "Configuração de ambiente inválida: VITE_USE_MOCK_API=false exige VITE_API_URL definida (nunca cai em Mock API silenciosamente).",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [bloquearConfiguracaoInvalidaDeApi()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
