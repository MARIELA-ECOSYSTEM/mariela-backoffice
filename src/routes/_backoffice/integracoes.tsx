import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/integracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Integrações — MARIELA Backoffice" },
      { name: "description", content: "Integrações com PDV, e-commerce e serviços externos." },
      { property: "og:title", content: "Integrações — MARIELA Backoffice" },
      { property: "og:description", content: "Integrações com PDV, e-commerce e serviços externos." },
    ],
  }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  return (
    <Page
      titulo="Integrações"
      breadcrumbs={[{ label: "Sistema" }, { label: "Integrações" }]}
    >
      <EmDesenvolvimento modulo="Integrações" />
    </Page>
  );
}
