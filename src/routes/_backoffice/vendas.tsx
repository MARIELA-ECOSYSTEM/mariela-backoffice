import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { NotaDemonstracao } from "@/components/common/data-toolbar";
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
    <Page
      titulo="Vendas"
      breadcrumbs={[{ label: "Operação" }, { label: "Vendas" }]}
      descricao="Área reservada para o acompanhamento administrativo das vendas."
    >
      <NotaDemonstracao>
        As regras de venda pertencem ao <strong>MARIELA PDV</strong>, que será desenvolvido como
        sistema separado. Nenhum contrato de venda é criado nesta etapa.
      </NotaDemonstracao>
      <EmDesenvolvimento modulo="Vendas" />
    </Page>
  );
}
