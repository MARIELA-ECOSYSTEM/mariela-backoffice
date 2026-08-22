import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/relatorios")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Relatórios — MARIELA Backoffice" },
      { name: "description", content: "Relatórios gerenciais de catálogo, estoque e vendas." },
      { property: "og:title", content: "Relatórios — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Relatórios gerenciais de catálogo, estoque e vendas.",
      },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <Page titulo="Relatórios" breadcrumbs={[{ label: "Sistema" }, { label: "Relatórios" }]}>
      <EmDesenvolvimento modulo="Relatórios" />
    </Page>
  );
}
