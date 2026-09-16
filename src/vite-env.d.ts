/// <reference types="vite/client" />

/**
 * Fase 8.6 — declara nominalmente as 4 variáveis `VITE_*` lidas pelo projeto
 * (`client.ts`, `auth.mock.ts`) para que `import.meta.env.VITE_X` (notação de
 * ponto) seja aceito com `noPropertyAccessFromIndexSignature` ativo. Sem isto,
 * o TypeScript só enxerga a index signature genérica de `ImportMetaEnv`
 * (`vite/client`), que exige notação de colchete — mas o acesso por colchete
 * impede o Vite de substituir cada chave por um literal individual no build,
 * o que faz o bundler embutir o objeto `import.meta.env` inteiro (e a camada
 * Mock inteira, alcançável a partir dele) no bundle de produção.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_MOCK_LOGIN?: string;
  readonly VITE_MOCK_SENHA?: string;
}
