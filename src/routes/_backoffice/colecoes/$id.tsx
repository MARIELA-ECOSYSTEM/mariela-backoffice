import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { DetalhePeriodo } from "@/components/cadastros/detalhe-periodo";
import { ErrorState, EmptyState } from "@/components/common/states";
import { CardsSkeleton } from "@/components/common/data-toolbar";
import { useColecao, useProdutosDaColecao } from "@/hooks/use-cadastros";

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
  const { data: colecao, isPending, isError, error, refetch } = useColecao(id);
  const { data: produtos } = useProdutosDaColecao(id);

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
        <DetalhePeriodo item={colecao} tipo="colecao" produtos={produtos ?? []} />
      )}
    </Page>
  );
}
