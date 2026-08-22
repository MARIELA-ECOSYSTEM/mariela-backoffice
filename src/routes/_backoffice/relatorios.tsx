import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardsSkeleton, NotaDemonstracao } from "@/components/common/data-toolbar";
import { ErrorState } from "@/components/common/states";
import { BarraSerie } from "@/components/relatorios/barra-serie";
import { useResumoRelatorios } from "@/hooks/use-relatorios";
import { formatarMoeda, formatarPercentual } from "@/utils/format";

export const Route = createFileRoute("/_backoffice/relatorios")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Relatórios — MARIELA Backoffice" },
      { name: "description", content: "Relatórios gerenciais de catálogo, estoque e margem." },
      { property: "og:title", content: "Relatórios — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Relatórios gerenciais de catálogo, estoque e margem.",
      },
    ],
  }),
  component: RelatoriosPage,
});

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="space-y-1 p-5">
        <p className="text-eyebrow">{rotulo}</p>
        <p className="font-display text-3xl leading-none">{valor}</p>
        {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
      </CardContent>
    </Card>
  );
}

function RelatoriosPage() {
  const { data: resumo, isPending, isError, error, refetch, isFetching } = useResumoRelatorios();

  return (
    <Page
      titulo="Relatórios"
      breadcrumbs={[{ label: "Gestão" }, { label: "Relatórios" }]}
      descricao="Indicadores gerenciais de catálogo, estoque e margem."
      acoes={
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw aria-hidden className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      {resumo?.demonstracao ? (
        <NotaDemonstracao>
          Dados de <strong>demonstração</strong> calculados sobre o catálogo mock. Os números
          definitivos virão do endpoint <code>/relatorios/resumo</code> da API.
        </NotaDemonstracao>
      ) : null}

      {isPending ? (
        <CardsSkeleton itens={6} altura={120} />
      ) : isError || !resumo ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-7">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Produtos cadastrados"
              valor={String(resumo.totalProdutos)}
              detalhe={`${resumo.totalVariantes} variantes`}
            />
            <Indicador
              rotulo="Peças em estoque"
              valor={resumo.pecasEmEstoque.toLocaleString("pt-BR")}
              detalhe={`${resumo.produtosSemEstoque} produto(s) sem estoque`}
            />
            <Indicador
              rotulo="Estoque a custo"
              valor={formatarMoeda(resumo.valorCustoEstoque)}
              detalhe={`Venda potencial ${formatarMoeda(resumo.valorVendaEstoque)}`}
            />
            <Indicador
              rotulo="Margem média"
              valor={formatarPercentual(resumo.margemMediaPercentual)}
              detalhe="Sobre o preço vigente"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <BarraSerie
              titulo="Produtos por categoria"
              descricao="Distribuição do catálogo entre as categorias configuradas."
              serie={resumo.produtosPorCategoria}
            />
            <BarraSerie
              titulo="Peças por categoria"
              descricao="Volume físico disponível por categoria."
              serie={resumo.pecasPorCategoria}
            />
            <BarraSerie
              titulo="Maiores estoques"
              descricao="Produtos com mais peças disponíveis."
              serie={resumo.topEstoque}
            />
            <BarraSerie
              titulo="Cadastros por mês"
              descricao="Produtos criados nos últimos seis meses."
              serie={resumo.cadastrosPorMes}
            />
          </div>
        </div>
      )}
    </Page>
  );
}
