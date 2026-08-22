import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/campanhas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Campanhas — MARIELA Backoffice" },
      { name: "description", content: "Campanhas promocionais e ações de marketing." },
      { property: "og:title", content: "Campanhas — MARIELA Backoffice" },
      { property: "og:description", content: "Campanhas promocionais e ações de marketing." },
    ],
  }),
  component: CampanhasPage,
});

function CampanhasPage() {
  return (
    <Page
      titulo="Campanhas"
      breadcrumbs={[{ label: "Marketing" }, { label: "Campanhas" }]}
    >
      <EmDesenvolvimento modulo="Campanhas" />
    </Page>
  );
}
