import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { DetalhePeriodo } from "@/components/cadastros/detalhe-periodo";
import { ErrorState, EmptyState } from "@/components/common/states";
import { CardsSkeleton } from "@/components/common/data-toolbar";
import { useCampanha, useProdutosDaCampanha } from "@/hooks/use-cadastros";

export const Route = createFileRoute("/_backoffice/campanhas/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe da campanha — MARIELA Backoffice" },
      {
        name: "description",
        content: "Período, conteúdo de vitrine e produtos vinculados da campanha.",
      },
      { property: "og:title", content: "Detalhe da campanha — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Período, conteúdo de vitrine e produtos vinculados da campanha.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhaDetalhePage,
});

function CampanhaDetalhePage() {
  const { id } = Route.useParams();
  const { data: campanha, isPending, isError, error, refetch } = useCampanha(id);
  const { data: produtos } = useProdutosDaCampanha(id);

  return (
    <Page
      titulo={campanha?.nome ?? "Campanha"}
      breadcrumbs={[{ label: "Catálogo" }, { label: "Campanhas", to: "/campanhas" }]}
      descricao="Visão completa da campanha e dos produtos que a compõem."
    >
      {isPending ? (
        <CardsSkeleton itens={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !campanha ? (
        <EmptyState
          titulo="Campanha não encontrada"
          descricao="Ela pode ter sido excluída. Volte para a listagem de campanhas."
        />
      ) : (
        <DetalhePeriodo item={campanha} tipo="campanha" produtos={produtos ?? []} />
      )}
    </Page>
  );
}
