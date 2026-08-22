import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { GerenciarVariantes } from "@/components/produtos/gerenciar-variantes";
import { useProduto } from "@/hooks/use-produtos";

export const Route = createFileRoute("/_backoffice/produtos/$id/variantes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Variantes do produto — MARIELA Backoffice" },
      { name: "description", content: "Gerencie cores, tamanhos e estoque das variantes do produto." },
      { property: "og:title", content: "Variantes do produto — MARIELA Backoffice" },
      { property: "og:description", content: "Gerencie cores, tamanhos e estoque das variantes do produto." },
    ],
  }),
  component: VariantesPage,
});

function VariantesPage() {
  const { id } = Route.useParams();
  const { data: produto, isPending, isError, error, refetch } = useProduto(id);

  return (
    <Page
      titulo={produto ? `Variantes · ${produto.nome}` : "Variantes"}
      breadcrumbs={[
        { label: "Catálogo" },
        { label: "Produtos", to: "/produtos" },
        { label: "Variantes" },
      ]}
    >
      {isPending ? (
        <TableSkeleton linhas={4} colunas={3} />
      ) : isError || !produto ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <GerenciarVariantes produto={produto} />
      )}
    </Page>
  );
}
