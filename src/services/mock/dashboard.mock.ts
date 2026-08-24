import { registerMock } from "./mock-transport";
import { agora, clonar, db } from "./db";
import { precoFinal } from "@/utils/produto";
import type {
  DashboardClientes,
  DashboardEstoque,
  DashboardFornecedores,
  DashboardVendas,
  DashboardVendedores,
  MesReferencia,
  PessoaResumo,
  PontoEvolucaoVendas,
  RankingVendedor,
  ResumoDashboard,
} from "@/types/dashboard";
import type { VendaResumo } from "@/types/venda";

const MESES_DISPONIVEIS = 6;

function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function labelMes(chave: string): string {
  const [ano, mes] = chave.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function mesesDisponiveis(): MesReferencia[] {
  const lista: MesReferencia[] = [];
  for (let i = 0; i < MESES_DISPONIVEIS; i += 1) {
    const data = new Date();
    data.setDate(1);
    data.setMonth(data.getMonth() - i);
    const valor = chaveMes(data);
    lista.push({ valor, label: labelMes(valor) });
  }
  return lista;
}

function mesAnterior(chave: string): string {
  const [ano, mes] = chave.split("-");
  const data = new Date(Number(ano), Number(mes) - 2, 1);
  return chaveMes(data);
}

/** Vendas contabilizadas nos indicadores: canceladas nunca entram no faturamento. */
function faturaveis(): VendaResumo[] {
  return db.vendas.filter((venda) => venda.status !== "cancelada");
}

function doMes(vendas: VendaResumo[], chave: string): VendaResumo[] {
  return vendas.filter((venda) => chaveMes(new Date(venda.dataVenda)) === chave);
}

function somar(vendas: VendaResumo[]): number {
  return Number(vendas.reduce((total, venda) => total + venda.valorFinal, 0).toFixed(2));
}

function evolucaoDoMes(vendas: VendaResumo[], chave: string): PontoEvolucaoVendas[] {
  const [ano, mes] = chave.split("-").map(Number);
  const diasNoMes = new Date(ano!, mes!, 0).getDate();
  const pontos: PontoEvolucaoVendas[] = [];
  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    const doDia = vendas.filter((venda) => new Date(venda.dataVenda).getDate() === dia);
    pontos.push({
      data: `${chave}-${String(dia).padStart(2, "0")}`,
      label: `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`,
      vendas: doDia.length,
      faturamento: somar(doDia),
    });
  }
  return pontos;
}

function resumoVendas(chaveSolicitada: string): DashboardVendas {
  const disponiveis = mesesDisponiveis();
  const chave = disponiveis.some((mes) => mes.valor === chaveSolicitada)
    ? chaveSolicitada
    : disponiveis[0]!.valor;

  const vendas = faturaveis();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(inicioSemana.getDate() - 6);

  const doDia = vendas.filter((venda) => new Date(venda.dataVenda) >= hoje);
  const daSemana = vendas.filter((venda) => new Date(venda.dataVenda) >= inicioSemana);
  const doMesAtual = doMes(vendas, chave);
  const doMesAnterior = doMes(vendas, mesAnterior(chave));

  const faturamentoMes = somar(doMesAtual);
  const faturamentoMesAnterior = somar(doMesAnterior);

  return {
    mesReferencia: chave,
    mesLabel: labelMes(chave),
    mesesDisponiveis: disponiveis,
    vendasHoje: doDia.length,
    faturamentoHoje: somar(doDia),
    vendasSemana: daSemana.length,
    faturamentoSemana: somar(daSemana),
    vendasMes: doMesAtual.length,
    faturamentoMes,
    ticketMedioMes: doMesAtual.length ? Number((faturamentoMes / doMesAtual.length).toFixed(2)) : 0,
    vendasMesAnterior: doMesAnterior.length,
    faturamentoMesAnterior,
    crescimentoMensalPercentual: faturamentoMesAnterior
      ? Number(
          (((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100).toFixed(2),
        )
      : 0,
    evolucao: evolucaoDoMes(doMesAtual, chave),
    ultimasVendas: clonar(
      [...db.vendas]
        .sort((a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime())
        .slice(0, 6),
    ),
  };
}

function resumoEstoque(): DashboardEstoque {
  const produtos = db.produtos;
  const pecasEmEstoque = produtos.reduce((total, p) => total + p.quantidadeTotal, 0);
  const custoEstoque = produtos.reduce((total, p) => total + p.precoCusto * p.quantidadeTotal, 0);
  const vendaPotencial = produtos.reduce(
    (total, p) => total + precoFinal(p) * p.quantidadeTotal,
    0,
  );

  return {
    produtosCadastrados: produtos.length,
    variantesCadastradas: produtos.reduce((total, p) => total + p.variantes.length, 0),
    pecasEmEstoque,
    produtosSemEstoque: produtos.filter((p) => p.quantidadeTotal === 0).length,
    custoEstoque: Number(custoEstoque.toFixed(2)),
    vendaPotencial: Number(vendaPotencial.toFixed(2)),
    lucroPotencial: Number((vendaPotencial - custoEstoque).toFixed(2)),
    // Margem ponderada pelo estoque: (potencial - custo) / potencial.
    margemMediaPercentual: vendaPotencial
      ? Number((((vendaPotencial - custoEstoque) / vendaPotencial) * 100).toFixed(2))
      : 0,
    ticketMedioEstoque: pecasEmEstoque ? Number((vendaPotencial / pecasEmEstoque).toFixed(2)) : 0,
  };
}

function recentes(
  lista: { id: string; nome: string; foto: string | null; ativo: boolean; criadoEm: string }[],
  detalheDe: (id: string) => string,
): PessoaResumo[] {
  return [...lista]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      nome: item.nome,
      foto: item.foto,
      ativo: item.ativo,
      criadoEm: item.criadoEm,
      detalhe: detalheDe(item.id),
    }));
}

function resumoClientes(chave: string): DashboardClientes {
  const clientes = db.clientes;
  const vendasDoMes = doMes(faturaveis(), chave);
  const compradoras = new Set(
    vendasDoMes.map((venda) => venda.clienteId).filter((id): id is string => Boolean(id)),
  );
  const faturamentoIdentificado = somar(vendasDoMes.filter((venda) => venda.clienteId));

  return {
    cadastrados: clientes.length,
    // Clientes não possuem status ativo/inativo — todo cadastro é considerado ativo.
    ativos: clientes.length,
    inativos: 0,
    novosNoMes: clientes.filter((cliente) => chaveMes(new Date(cliente.criadoEm)) === chave).length,
    compraramNoMes: compradoras.size,
    ticketMedioPorCliente: compradoras.size
      ? Number((faturamentoIdentificado / compradoras.size).toFixed(2))
      : 0,
    recentes: recentes(
      clientes.map((cliente) => ({ ...cliente, ativo: true })),
      (id) => db.clientes.find((cliente) => cliente.id === id)?.telefone ?? "",
    ),
  };
}

function resumoFornecedores(): DashboardFornecedores {
  const fornecedores = db.fornecedores;
  return {
    cadastrados: fornecedores.length,
    // Fornecedor não possui status: o indicador passa a medir vínculo com produtos.
    ativos: fornecedores.filter((f) => f.produtosVinculados > 0).length,
    inativos: fornecedores.filter((f) => f.produtosVinculados === 0).length,
    recentes: recentes(
      fornecedores.map((fornecedor) => ({ ...fornecedor, ativo: true })),
      (id) => {
        const produtos = db.produtos.filter((produto) => produto.fornecedorId === id).length;
        return `${produtos} ${produtos === 1 ? "produto" : "produtos"}`;
      },
    ),
  };
}

function resumoVendedores(chave: string): DashboardVendedores {
  const vendedores = db.vendedores;
  const vendasDoMes = doMes(faturaveis(), chave);

  const ranking: RankingVendedor[] = vendedores
    .map((vendedor) => {
      const suas = vendasDoMes.filter((venda) => venda.vendedorId === vendedor.id);
      const faturamento = somar(suas);
      return {
        vendedorId: vendedor.id,
        nome: vendedor.nome,
        foto: vendedor.foto,
        vendas: suas.length,
        faturamento,
        ticketMedio: suas.length ? Number((faturamento / suas.length).toFixed(2)) : 0,
      };
    })
    .filter((item) => item.vendas > 0)
    .sort((a, b) => b.faturamento - a.faturamento);

  return {
    cadastrados: vendedores.length,
    ativos: vendedores.filter((v) => v.ativo).length,
    inativos: vendedores.filter((v) => !v.ativo).length,
    ranking,
  };
}

/** Contrato: GET /dashboard/resumo?mes=YYYY-MM */
export function registerDashboardMocks(): void {
  registerMock("GET", "/dashboard/resumo", ({ query }) => {
    const vendas = resumoVendas(String(query["mes"] ?? ""));
    const resumo: ResumoDashboard = {
      demonstracao: true,
      geradoEm: agora(),
      vendas,
      estoque: resumoEstoque(),
      clientes: resumoClientes(vendas.mesReferencia),
      fornecedores: resumoFornecedores(),
      vendedores: resumoVendedores(vendas.mesReferencia),
    };
    return { data: resumo };
  });
}
