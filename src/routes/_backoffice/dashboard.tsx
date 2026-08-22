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
      {
        name: "description",
        content: "Visão geral do catálogo, estoque e promoções da loja Mariela.",
      },
      { property: "og:title", content: "Dashboard — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Visão geral do catálogo, estoque e promoções da loja Mariela.",
      },
    ],
  }),
  component: DashboardPage,
});

function Indicador({
  titulo,
  valor,
  detalhe,
  icone: Icone,
  destaque,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: typeof Tag;
  destaque?: boolean;
}) {
  return (
    <Card
      className={
        destaque
          ? "relative overflow-hidden border-primary/20 bg-primary-soft/45 shadow-raised"
          : "transition-shadow duration-200 hover:shadow-raised"
      }
    >
      {destaque ? (
        <span aria-hidden className="rule-gold absolute inset-x-0 top-0 h-px opacity-80" />
      ) : null}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <p className="text-eyebrow">{titulo}</p>
        <Icone
          aria-hidden
          className={destaque ? "size-4 text-primary/70" : "size-4 text-muted-foreground/70"}
        />
      </CardHeader>
      <CardContent>
        <p className={destaque ? "text-metric text-primary" : "text-metric"}>{valor}</p>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { data, isPending, isError, error, refetch } = useProdutos({
    ordenarPor: "criadoEm",
    ordem: "desc",
  });
  const produtos = data?.produtos ?? [];

  const totalPecas = produtos.reduce((total, p) => total + p.quantidadeTotal, 0);
  const semEstoque = produtos.filter((p) => p.quantidadeTotal === 0);
  const estoqueBaixo = produtos.filter(
    (p) => p.quantidadeTotal > 0 && p.quantidadeTotal <= ESTOQUE_BAIXO,
  );
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
        <div className="space-y-7">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Produtos cadastrados"
              valor={String(produtos.length)}
              detalhe={`${produtos.length - semEstoque.length} com estoque disponível`}
              icone={Tag}
            />
            <Indicador
              destaque
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/70 pb-4">
                <div>
                  <CardTitle className="text-xl">Atenção no estoque</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Peças esgotadas ou próximas do fim
                  </p>
                </div>
                <AlertTriangle aria-hidden className="size-4 text-warning" />
              </CardHeader>
              <CardContent className="pt-4">
                {[...semEstoque, ...estoqueBaixo].slice(0, 6).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum produto exige atenção no momento.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {[...semEstoque, ...estoqueBaixo].slice(0, 6).map((produto) => (
                      <li key={produto.id}>
                        <Link
                          to="/produtos/$id"
                          params={{ id: produto.id }}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-primary-soft/30"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{produto.nome}</span>
                            <span className="block font-brand text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                              {produto.codProduto}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {produto.quantidadeTotal} un.
                            </span>
                            <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70 pb-4">
                <CardTitle className="text-xl">Novidades recentes</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Últimas peças marcadas como novidade
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                {novidades.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma novidade cadastrada.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {novidades.map((produto) => (
                      <li key={produto.id}>
                        <Link
                          to="/produtos/$id"
                          params={{ id: produto.id }}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-primary-soft/30"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{produto.nome}</span>
                            <span className="block font-brand text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                              {produto.categoria}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="text-sm tabular-nums">
                              {formatarMoeda(precoFinal(produto))}
                            </span>
                            {produto.ehPromocao ? <Badge variant="gold">Promoção</Badge> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
