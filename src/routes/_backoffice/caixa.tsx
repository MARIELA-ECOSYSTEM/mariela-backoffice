import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/caixa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Caixa — MARIELA Backoffice" },
      { name: "description", content: "Abertura, fechamento e movimentações do caixa." },
      { property: "og:title", content: "Caixa — MARIELA Backoffice" },
      { property: "og:description", content: "Abertura, fechamento e movimentações do caixa." },
    ],
  }),
  component: CaixaPage,
});

function CaixaPage() {
  return (
    <Page
      titulo="Caixa"
      breadcrumbs={[{ label: "Comercial" }, { label: "Caixa" }]}
    >
      <EmDesenvolvimento modulo="Caixa" />
    </Page>
  );
}
