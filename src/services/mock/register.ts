import { registerAuthMocks } from "./auth.mock";
import { registerProdutosMocks } from "./produtos.mock";
import { registerVariantesMocks } from "./variantes.mock";
import { registerEstoqueMocks } from "./estoque.mock";
import { registerConfiguracoesMocks } from "./configuracoes.mock";
import { registerCadastrosMocks } from "./cadastros.mock";
import { registerVendedoresMocks } from "./vendedores.mock";
import { registerVendasMocks } from "./vendas.mock";
import { registerRelatoriosMocks } from "./relatorios.mock";
import { registerDashboardMocks } from "./dashboard.mock";
import { registerIntegracoesMocks } from "./integracoes.mock";

let registrado = false;

/**
 * Registro das rotas mockadas.
 *
 * IMPORTANTE: este módulo NÃO pode registrar as rotas apenas por efeito colateral
 * de import. O `package.json` declara `"sideEffects": false`, então o bundler de
 * produção remove módulos importados somente por efeito colateral — foi essa a
 * causa do erro "Recurso não encontrado: POST /auth/login" no ambiente publicado.
 * Exportando uma função usada explicitamente, o código sempre sobrevive ao build.
 */
export function registrarMocks(): void {
  if (registrado) return;
  registrado = true;

  registerAuthMocks();
  registerProdutosMocks();
  registerVariantesMocks();
  registerEstoqueMocks();
  registerConfiguracoesMocks();
  registerCadastrosMocks();
  registerVendedoresMocks();
  registerVendasMocks();
  registerRelatoriosMocks();
  registerDashboardMocks();
  registerIntegracoesMocks();
}
