import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { DetalhePeriodo } from "@/components/cadastros/detalhe-periodo";
import { ErrorState, EmptyState } from "@/components/common/states";
import { CardsSkeleton } from "@/components/common/data-toolbar";
import { useColecoes } from "@/hooks/use-cadastros";
import { useProdutos } from "@/hooks/use-produtos";

export const Route = createFileRoute("/_backoffice/colecoes/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe da coleção — MARIELA Backoffice" },
      {
        name: "description",
        content: "Período, conteúdo de vitrine e produtos vinculados da coleção.",
      },
      { property: "og:title", content: "Detalhe da coleção — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Período, conteúdo de vitrine e produtos vinculados da coleção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ColecaoDetalhePage,
});

function ColecaoDetalhePage() {
  const { id } = Route.useParams();
  const { data: colecoes, isPending, isError, error, refetch } = useColecoes();
  const { data: produtos } = useProdutos({});

  const colecao = (colecoes ?? []).find((item) => item.id === id);
  const vinculados = (produtos?.produtos ?? []).filter((produto) => produto.colecaoId === id);

  return (
    <Page
      titulo={colecao?.nome ?? "Coleção"}
      breadcrumbs={[{ label: "Catálogo" }, { label: "Coleções", to: "/colecoes" }]}
      descricao="Visão completa da coleção e dos produtos que a compõem."
    >
      {isPending ? (
        <CardsSkeleton itens={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !colecao ? (
        <EmptyState
          titulo="Coleção não encontrada"
          descricao="Ela pode ter sido excluída. Volte para a listagem de coleções."
        />
      ) : (
        <DetalhePeriodo item={colecao} tipo="colecao" produtos={vinculados} />
      )}
    </Page>
  );
}
