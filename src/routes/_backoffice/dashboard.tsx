import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, PackageX, Sparkles, Tag, TrendingUp } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge } from "@/components/common/status-badge";
import { useProdutos } from "@/hooks/use-produtos";
import { formatarMoeda } from "@/utils/format";
import { ESTOQUE_BAIXO, precoFinal } from "@/utils/produto";

export const Route = createFileRoute("/_backoffice/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — MARIELA Backoffice" },
      { name: "description", content: "Visão geral do catálogo, estoque e promoções da loja Mariela." },
      { property: "og:title", content: "Dashboard — MARIELA Backoffice" },
      { property: "og:description", content: "Visão geral do catálogo, estoque e promoções da loja Mariela." },
    ],
  }),
  component: DashboardPage,
});

function Indicador({
  titulo,
  valor,
  detalhe,
  icone: Icone,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: typeof Tag;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-eyebrow font-sans">{titulo}</CardTitle>
        <Icone aria-hidden className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl leading-none">{valor}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { data, isPending, isError, error, refetch } = useProdutos({ ordenarPor: "criadoEm", ordem: "desc" });
  const produtos = data?.produtos ?? [];

  const totalPecas = produtos.reduce((total, p) => total + p.quantidadeTotal, 0);
  const semEstoque = produtos.filter((p) => p.quantidadeTotal === 0);
  const estoqueBaixo = produtos.filter((p) => p.quantidadeTotal > 0 && p.quantidadeTotal <= ESTOQUE_BAIXO);
  const emPromocao = produtos.filter((p) => p.ehPromocao);
  const valorEstoque = produtos.reduce((total, p) => total + precoFinal(p) * p.quantidadeTotal, 0);
  const novidades = produtos.filter((p) => p.ehNovidade).slice(0, 5);

  return (
    <Page
      titulo="Dashboard"
      descricao="Panorama do catálogo Mariela: disponibilidade, promoções e novidades da coleção."
      acoes={
        <Button asChild>
          <Link to="/produtos/novo">Novo produto</Link>
        </Button>
      }
    >
      {isPending ? (
        <TableSkeleton linhas={5} colunas={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Produtos cadastrados"
              valor={String(produtos.length)}
              detalhe={`${produtos.length - semEstoque.length} com estoque disponível`}
              icone={Tag}
            />
            <Indicador
              titulo="Peças em estoque"
              valor={String(totalPecas)}
              detalhe={`Valor estimado ${formatarMoeda(valorEstoque)}`}
              icone={TrendingUp}
            />
            <Indicador
              titulo="Sem estoque"
              valor={String(semEstoque.length)}
              detalhe={`${estoqueBaixo.length} produtos com estoque baixo`}
              icone={PackageX}
            />
            <Indicador
              titulo="Em promoção"
              valor={String(emPromocao.length)}
              detalhe={`${produtos.filter((p) => p.ehNovidade).length} marcados como novidade`}
              icone={Sparkles}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-display text-xl">Atenção no estoque</CardTitle>
                <AlertTriangle aria-hidden className="size-4 text-warning" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[...semEstoque, ...estoqueBaixo].slice(0, 6).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum produto exige atenção no momento.
                  </p>
                ) : (
                  [...semEstoque, ...estoqueBaixo].slice(0, 6).map((produto) => (
                    <Link
                      key={produto.id}
                      to="/produtos/$id"
                      params={{ id: produto.id }}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-accent/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{produto.nome}</span>
                        <span className="block text-xs text-muted-foreground">{produto.codProduto}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">{produto.quantidadeTotal} un.</span>
                        <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Novidades recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {novidades.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma novidade cadastrada.
                  </p>
                ) : (
                  novidades.map((produto) => (
                    <Link
                      key={produto.id}
                      to="/produtos/$id"
                      params={{ id: produto.id }}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-accent/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{produto.nome}</span>
                        <span className="block text-xs text-muted-foreground">{produto.categoria}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm tabular-nums">{formatarMoeda(precoFinal(produto))}</span>
                        {produto.ehPromocao ? (
                          <Badge variant="outline" className="border-gold/40 bg-gold/15 text-gold-foreground">
                            Promoção
                          </Badge>
                        ) : null}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
