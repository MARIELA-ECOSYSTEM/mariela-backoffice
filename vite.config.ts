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

/**
 * Fase 22 — build estático para Tauri, isolado do build web por uma variável
 * de ambiente de PROCESSO (nunca `VITE_*`, para não vazar para o bundle nem
 * para `import.meta.env`): `BUILD_TARGET=desktop bun run build:desktop`.
 *
 * Deliberadamente NÃO usamos `--mode desktop` para isso: `mode` continua
 * "production" em ambos os builds, então `import.meta.env.PROD` (checado em
 * `src/services/api/client.ts`) e o `mode === "production"` do plugin acima
 * continuam protegendo o build desktop exatamente como já protegem o build
 * web, sem precisar duplicar/generalizar nenhuma das duas checagens.
 *
 * Sem Nitro (`nitro: false`): nenhum servidor é empacotado — o Tauri carrega
 * arquivos estáticos diretamente, sem processo Node/Worker por trás.
 * `tanstackStart.spa` é o modo oficial do próprio TanStack Start para isso:
 * pré-renderiza o shell da aplicação em HTML estático (hidratado no cliente)
 * em vez de depender de SSR por requisição — só existe porque não há
 * `createServerFn`/`loader` nas rotas hoje (confirmado por auditoria; ver
 * relatório da Fase 22), então nenhum dado real depende do servidor.
 */
const isDesktopBuild = process.env["BUILD_TARGET"] === "desktop";

export default defineConfig({
  plugins: [bloquearConfiguracaoInvalidaDeApi()],
  vite: {
    server: {
      port: 8081,
      strictPort: true,
    },
  },
  ...(isDesktopBuild ? { nitro: false } : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isDesktopBuild
      ? {
          spa: {
            enabled: true,
            // Default outputPath ("/_shell") is meant for a rewrite rule on a
            // static host; Tauri just serves whatever file sits at the root
            // of frontendDist, so the shell needs to physically be index.html.
            prerender: { enabled: true, outputPath: "/index" },
          },
        }
      : {}),
  },
});
