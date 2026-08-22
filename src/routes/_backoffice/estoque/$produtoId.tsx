import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge } from "@/components/common/status-badge";
import { GerenciarVariantes } from "@/components/produtos/gerenciar-variantes";
import { useProduto } from "@/hooks/use-produtos";
import { formatarData } from "@/utils/format";

export const Route = createFileRoute("/_backoffice/estoque/$produtoId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estoque do produto — MARIELA Backoffice" },
      { name: "description", content: "Entradas, saídas e tamanhos de cada variante do produto." },
      { property: "og:title", content: "Estoque do produto — MARIELA Backoffice" },
      { property: "og:description", content: "Entradas, saídas e tamanhos de cada variante do produto." },
    ],
  }),
  component: EstoqueProdutoPage,
});

function EstoqueProdutoPage() {
  const { produtoId } = Route.useParams();
  const { data: produto, isPending, isError, error, refetch } = useProduto(produtoId);

  return (
    <Page
      titulo={produto ? `Estoque · ${produto.nome}` : "Estoque do produto"}
      breadcrumbs={[{ label: "Catálogo" }, { label: "Estoque", to: "/estoque" }, { label: "Produto" }]}
      acoes={
        produto ? (
          <Button asChild variant="outline">
            <Link to="/produtos/$id" params={{ id: produto.id }}>
              Ver produto
            </Link>
          </Button>
        ) : undefined
      }
    >
      {isPending ? (
        <TableSkeleton linhas={5} colunas={3} />
      ) : isError || !produto ? (
        <ErrorState error={error} onRetry={() => void refetch()} fallback="Produto não encontrado." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-eyebrow font-sans">Quantidade total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl leading-none">{produto.quantidadeTotal}</p>
                <div className="mt-3">
                  <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-eyebrow font-sans">Variantes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl leading-none">{produto.variantes.length}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {produto.variantes.reduce((total, v) => total + v.tamanhos.length, 0)} tamanho(s)
                  cadastrado(s)
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-eyebrow font-sans">Estoque zerado em</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-2xl leading-none">
                  {formatarData(produto.estoqueZeradoEm)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Volta a ser nulo quando o produto recebe estoque.
                </p>
              </CardContent>
            </Card>
          </div>

          <GerenciarVariantes produto={produto} />
        </div>
      )}
    </Page>
  );
}
