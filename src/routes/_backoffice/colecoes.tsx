import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/colecoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Coleções — MARIELA Backoffice" },
      { name: "description", content: "Coleções e temporadas do catálogo Mariela." },
      { property: "og:title", content: "Coleções — MARIELA Backoffice" },
      { property: "og:description", content: "Coleções e temporadas do catálogo Mariela." },
    ],
  }),
  component: ColecoesPage,
});

function ColecoesPage() {
  return (
    <Page titulo="Coleções" breadcrumbs={[{ label: "Marketing" }, { label: "Coleções" }]}>
      <EmDesenvolvimento modulo="Coleções" />
    </Page>
  );
}
