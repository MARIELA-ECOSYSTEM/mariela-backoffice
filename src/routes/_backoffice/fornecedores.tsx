import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/fornecedores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fornecedores — MARIELA Backoffice" },
      { name: "description", content: "Cadastro de fornecedores e parceiros de produção." },
      { property: "og:title", content: "Fornecedores — MARIELA Backoffice" },
      { property: "og:description", content: "Cadastro de fornecedores e parceiros de produção." },
    ],
  }),
  component: FornecedoresPage,
});

function FornecedoresPage() {
  return (
    <Page
      titulo="Fornecedores"
      breadcrumbs={[{ label: "Comercial" }, { label: "Fornecedores" }]}
    >
      <EmDesenvolvimento modulo="Fornecedores" />
    </Page>
  );
}
