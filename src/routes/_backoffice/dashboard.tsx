import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  CircleSlash,
  Coins,
  Gem,
  Layers,
  Percent,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { NotaDemonstracao } from "@/components/common/data-toolbar";
import { SecaoDashboard } from "@/components/dashboard/secao";
import { Metrica } from "@/components/dashboard/metrica";
import { GraficoVendas } from "@/components/dashboard/grafico-vendas";
import { UltimasVendas } from "@/components/dashboard/ultimas-vendas";
import { RankingVendedores } from "@/components/dashboard/ranking-vendedores";
import { ListaPessoas } from "@/components/dashboard/lista-pessoas";
import { useResumoDashboard } from "@/hooks/use-dashboard";

export const Route = createFileRoute("/_backoffice/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — MARIELA Backoffice" },
      {
        name: "description",
        content:
          "Painel de gestão da loja Mariela: vendas, estoque, clientes, fornecedores e vendedoras.",
      },
      { property: "og:title", content: "Dashboard — MARIELA Backoffice" },
      {
        property: "og:description",
        content:
          "Painel de gestão da loja Mariela: vendas, estoque, clientes, fornecedores e vendedoras.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [mes, setMes] = useState("");
  const { data, isPending, isError, error, refetch } = useResumoDashboard(mes);

  return (
    <Page
      titulo="Dashboard"
      descricao="Panorama de gestão da loja Mariela: desempenho comercial, valor do estoque e cadastros."
      acoes={
        <>
          {data ? (
            <Select value={data.vendas.mesReferencia} onValueChange={setMes}>
              <SelectTrigger className="w-[190px]" aria-label="Mês de referência">
                <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.vendas.mesesDisponiveis.map((opcao) => (
                  <SelectItem key={opcao.valor} value={opcao.valor} className="capitalize">
                    {opcao.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button asChild>
            <Link to="/produtos/novo">Novo produto</Link>
          </Button>
        </>
      }
    >
      {isPending ? (
        <TableSkeleton linhas={6} colunas={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-10">
          {data.demonstracao ? (
            <NotaDemonstracao>
              Indicadores calculados sobre os dados de demonstração da camada mock. As vendas são
              originadas no <strong>MARIELA PDV</strong> e consumidas aqui apenas em leitura.
            </NotaDemonstracao>
          ) : null}

          <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica
              destaque
              rotulo={`Faturamento · ${data.vendas.mesLabel}`}
              valor={data.vendas.faturamentoMes}
              tipo="valor"
              icone={BadgeDollarSign}
              variacao={data.vendas.crescimentoMensalPercentual}
              detalhe="vs. mês anterior"
            />
            <Metrica
              rotulo="Vendas no mês"
              valor={data.vendas.vendasMes}
              tipo="quantidade"
              unidade="vendas"
              icone={ShoppingBag}
              detalhe={`Ticket médio ${data.vendas.ticketMedioMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
            />
            <Metrica
              rotulo="Venda em potencial (estoque)"
              valor={data.estoque.vendaPotencial}
              tipo="valor"
              icone={Gem}
              detalhe={`${data.estoque.pecasEmEstoque.toLocaleString("pt-BR")} peças disponíveis`}
            />
            <Metrica
              rotulo="Clientes ativas"
              valor={data.clientes.ativos}
              tipo="quantidade"
              unidade="clientes"
              icone={Users}
              detalhe={`${data.clientes.compraramNoMes} compraram no mês`}
            />
          </section>

          <SecaoDashboard
            titulo="Vendas"
            icone={TrendingUp}
            descricao="Quantidade de vendas e faturamento apresentados separadamente."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metrica
                rotulo="Vendas hoje"
                valor={data.vendas.vendasHoje}
                tipo="quantidade"
                unidade="vendas"
                icone={ShoppingBag}
              />
              <Metrica
                rotulo="Vendas na semana"
                valor={data.vendas.vendasSemana}
                tipo="quantidade"
                unidade="vendas"
                icone={ShoppingBag}
              />
              <Metrica
                rotulo="Vendas no mês"
                valor={data.vendas.vendasMes}
                tipo="quantidade"
                unidade="vendas"
                icone={ShoppingBag}
              />
              <Metrica
                rotulo="Ticket médio mensal (vendas)"
                valor={data.vendas.ticketMedioMes}
                tipo="valor"
                icone={ReceiptText}
                detalhe="Faturamento do mês ÷ vendas do mês"
              />
              <Metrica
                rotulo="Faturamento diário"
                valor={data.vendas.faturamentoHoje}
                tipo="valor"
                icone={Wallet}
              />
              <Metrica
                rotulo="Faturamento semanal"
                valor={data.vendas.faturamentoSemana}
                tipo="valor"
                icone={Wallet}
              />
              <Metrica
                rotulo="Faturamento mensal"
                valor={data.vendas.faturamentoMes}
                tipo="valor"
                icone={Wallet}
              />
              <Metrica
                rotulo="Crescimento mensal"
                valor={data.vendas.crescimentoMensalPercentual}
                tipo="percentual"
                icone={Target}
                detalhe={`Mês anterior: ${data.vendas.faturamentoMesAnterior.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
              />
            </div>

            <GraficoVendas serie={data.vendas.evolucao} mesLabel={data.vendas.mesLabel} />

            <UltimasVendas
              vendas={data.vendas.ultimasVendas}
              acao={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/vendas">Ver todas</Link>
                </Button>
              }
            />
          </SecaoDashboard>

          <SecaoDashboard
            titulo="Produtos | Estoque"
            icone={Boxes}
            descricao="Fotografia administrativa do estoque existente, sem alertas de reposição."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metrica
                rotulo="Produtos cadastrados"
                valor={data.estoque.produtosCadastrados}
                tipo="quantidade"
                unidade="produtos"
                icone={Tag}
                detalhe={`${data.estoque.variantesCadastradas} variantes cadastradas`}
              />
              <Metrica
                rotulo="Peças em estoque"
                valor={data.estoque.pecasEmEstoque}
                tipo="quantidade"
                unidade="peças"
                icone={Layers}
                detalhe="Soma das quantidades por tamanho"
              />
              <Metrica
                rotulo="Produtos sem estoque"
                valor={data.estoque.produtosSemEstoque}
                tipo="quantidade"
                unidade="produtos"
                icone={CircleSlash}
                detalhe="Informação administrativa"
              />
              <Metrica
                rotulo="Custo de estoque"
                valor={data.estoque.custoEstoque}
                tipo="valor"
                icone={Coins}
                detalhe="Investido: Σ quantidade × preço de custo"
              />
              <Metrica
                rotulo="Venda em potencial"
                valor={data.estoque.vendaPotencial}
                tipo="valor"
                icone={Gem}
                detalhe="Valor das peças em estoque pelo preço vigente"
              />
              <Metrica
                rotulo="Lucro potencial"
                valor={data.estoque.lucroPotencial}
                tipo="valor"
                icone={Sparkles}
                detalhe="Venda em potencial − custo de estoque"
              />
              <Metrica
                rotulo="Margem média do estoque"
                valor={data.estoque.margemMediaPercentual}
                tipo="percentual"
                icone={Percent}
                detalhe="Ponderada: (potencial − custo) ÷ potencial"
              />
              <Metrica
                rotulo="Ticket médio do estoque"
                valor={data.estoque.ticketMedioEstoque}
                tipo="valor"
                icone={ReceiptText}
                detalhe="Venda em potencial ÷ peças em estoque"
              />
            </div>
          </SecaoDashboard>

          <SecaoDashboard
            titulo="Clientes"
            icone={Users}
            descricao="Base de clientes cadastradas e movimento do mês selecionado."
          >
            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metrica
                  rotulo="Clientes cadastradas"
                  valor={data.clientes.cadastrados}
                  tipo="quantidade"
                  unidade="clientes"
                  icone={Users}
                />
                <Metrica
                  rotulo="Clientes ativas"
                  valor={data.clientes.ativos}
                  tipo="quantidade"
                  unidade="clientes"
                  icone={UserRound}
                />
                <Metrica
                  rotulo="Clientes inativas"
                  valor={data.clientes.inativos}
                  tipo="quantidade"
                  unidade="clientes"
                  icone={CircleSlash}
                />
                <Metrica
                  rotulo="Novas no mês"
                  valor={data.clientes.novosNoMes}
                  tipo="quantidade"
                  unidade="clientes"
                  icone={Sparkles}
                />
                <Metrica
                  rotulo="Compraram no mês"
                  valor={data.clientes.compraramNoMes}
                  tipo="quantidade"
                  unidade="clientes"
                  icone={ShoppingBag}
                />
                <Metrica
                  rotulo="Ticket médio por cliente"
                  valor={data.clientes.ticketMedioPorCliente}
                  tipo="valor"
                  icone={ReceiptText}
                  detalhe="Vendas identificadas no mês"
                />
              </div>
              <ListaPessoas
                titulo="Clientes recentes"
                descricao="Últimos cadastros da base"
                pessoas={data.clientes.recentes}
                vazio="Nenhuma cliente cadastrada."
              />
            </div>
          </SecaoDashboard>

          <SecaoDashboard
            titulo="Fornecedores"
            icone={Store}
            descricao="Cadastro de fornecedores da coleção."
          >
            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <div className="grid content-start gap-4 sm:grid-cols-3">
                <Metrica
                  rotulo="Fornecedores cadastrados"
                  valor={data.fornecedores.cadastrados}
                  tipo="quantidade"
                  unidade="fornecedores"
                  icone={Store}
                />
                <Metrica
                  rotulo="Fornecedores ativos"
                  valor={data.fornecedores.ativos}
                  tipo="quantidade"
                  unidade="ativos"
                  icone={Store}
                />
                <Metrica
                  rotulo="Fornecedores inativos"
                  valor={data.fornecedores.inativos}
                  tipo="quantidade"
                  unidade="inativos"
                  icone={CircleSlash}
                />
              </div>
              <ListaPessoas
                titulo="Fornecedores recentes"
                descricao="Cadastros mais recentes e produtos vinculados"
                pessoas={data.fornecedores.recentes}
                vazio="Nenhum fornecedor cadastrado."
              />
            </div>
          </SecaoDashboard>

          <SecaoDashboard
            titulo="Vendedores"
            icone={UserRound}
            descricao="Equipe de vendas e desempenho gerencial no mês selecionado."
          >
            <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
              <div className="grid content-start gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <Metrica
                  rotulo="Vendedores cadastrados"
                  valor={data.vendedores.cadastrados}
                  tipo="quantidade"
                  unidade="vendedores"
                  icone={UserRound}
                />
                <Metrica
                  rotulo="Vendedores ativos"
                  valor={data.vendedores.ativos}
                  tipo="quantidade"
                  unidade="ativos"
                  icone={UserRound}
                />
                <Metrica
                  rotulo="Vendedores inativos"
                  valor={data.vendedores.inativos}
                  tipo="quantidade"
                  unidade="inativos"
                  icone={CircleSlash}
                />
              </div>
              <RankingVendedores
                ranking={data.vendedores.ranking}
                mesLabel={data.vendas.mesLabel}
              />
            </div>
          </SecaoDashboard>
        </div>
      )}
    </Page>
  );
}
