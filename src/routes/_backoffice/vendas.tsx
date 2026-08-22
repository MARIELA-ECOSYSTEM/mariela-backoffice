import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/vendas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vendas — MARIELA Backoffice" },
      { name: "description", content: "Registro e acompanhamento das vendas da loja." },
      { property: "og:title", content: "Vendas — MARIELA Backoffice" },
      { property: "og:description", content: "Registro e acompanhamento das vendas da loja." },
    ],
  }),
  component: VendasPage,
});

function VendasPage() {
  return (
    <Page titulo="Vendas" breadcrumbs={[{ label: "Comercial" }, { label: "Vendas" }]}>
      <EmDesenvolvimento modulo="Vendas" />
    </Page>
  );
}
