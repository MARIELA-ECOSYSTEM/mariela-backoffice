import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { EmDesenvolvimento } from "@/components/common/states";

export const Route = createFileRoute("/_backoffice/clientes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clientes — MARIELA Backoffice" },
      { name: "description", content: "Cadastro e histórico de clientes da loja Mariela." },
      { property: "og:title", content: "Clientes — MARIELA Backoffice" },
      { property: "og:description", content: "Cadastro e histórico de clientes da loja Mariela." },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  return (
    <Page
      titulo="Clientes"
      breadcrumbs={[{ label: "Comercial" }, { label: "Clientes" }]}
    >
      <EmDesenvolvimento modulo="Clientes" />
    </Page>
  );
}
