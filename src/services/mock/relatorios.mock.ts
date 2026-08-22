import { registerMock } from "./mock-transport";
import { agora, db } from "./db";
import { precoFinal } from "@/utils/produto";
import type { RelatorioSerie, ResumoRelatorios } from "@/types/relatorio";

function porCategoria(valorDe: (produtoIndex: number) => number): RelatorioSerie[] {
  const mapa = new Map<string, number>();
  db.produtos.forEach((produto, index) => {
    mapa.set(produto.categoria, (mapa.get(produto.categoria) ?? 0) + valorDe(index));
  });
  return [...mapa.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function cadastrosPorMes(): RelatorioSerie[] {
  const meses: RelatorioSerie[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const data = new Date();
    data.setMonth(data.getMonth() - i, 1);
    const label = data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const total = db.produtos.filter((produto) => {
      const criado = new Date(produto.criadoEm);
      return criado.getMonth() === data.getMonth() && criado.getFullYear() === data.getFullYear();
    }).length;
    meses.push({ label, valor: total });
  }
  return meses;
}

/** Relatórios de demonstração derivados do catálogo mock (contrato: GET /relatorios/resumo). */
export function registerRelatoriosMocks(): void {
  registerMock("GET", "/relatorios/resumo", () => {
    const produtos = db.produtos;
    const pecasEmEstoque = produtos.reduce((total, p) => total + p.quantidadeTotal, 0);
    const valorCustoEstoque = produtos.reduce(
      (total, p) => total + p.precoCusto * p.quantidadeTotal,
      0,
    );
    const valorVendaEstoque = produtos.reduce(
      (total, p) => total + precoFinal(p) * p.quantidadeTotal,
      0,
    );
    const margens = produtos.filter((p) => p.precoCusto > 0).map((p) => p.margemLucro);

    const resumo: ResumoRelatorios = {
      demonstracao: true,
      geradoEm: agora(),
      totalProdutos: produtos.length,
      totalVariantes: produtos.reduce((total, p) => total + p.variantes.length, 0),
      pecasEmEstoque,
      produtosSemEstoque: produtos.filter((p) => p.quantidadeTotal === 0).length,
      valorCustoEstoque: Number(valorCustoEstoque.toFixed(2)),
      valorVendaEstoque: Number(valorVendaEstoque.toFixed(2)),
      margemMediaPercentual: margens.length
        ? Number((margens.reduce((t, m) => t + m, 0) / margens.length).toFixed(2))
        : 0,
      produtosPorCategoria: porCategoria(() => 1),
      pecasPorCategoria: porCategoria((index) => db.produtos[index]?.quantidadeTotal ?? 0),
      topEstoque: [...produtos]
        .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal)
        .slice(0, 6)
        .map((p) => ({ label: p.nome, valor: p.quantidadeTotal })),
      cadastrosPorMes: cadastrosPorMes(),
    };

    return { data: resumo };
  });
}
