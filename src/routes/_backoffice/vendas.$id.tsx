import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { NotaDemonstracao } from "@/components/common/data-toolbar";
import { EmDesenvolvimento } from "@/components/common/states";
import { CodigoBadge } from "@/components/common/codigo-badge";

export const Route = createFileRoute("/_backoffice/vendas/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe da venda — MARIELA Backoffice" },
      { name: "description", content: "Detalhamento administrativo de uma venda da loja." },
      { property: "og:title", content: "Detalhe da venda — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Detalhamento administrativo de uma venda da loja.",
      },
    ],
  }),
  component: VendaDetalhePage,
});

function VendaDetalhePage() {
  const { id } = Route.useParams();

  return (
    <Page
      titulo="Detalhe da venda"
      breadcrumbs={[{ label: "Operação" }, { label: "Vendas", to: "/vendas" }, { label: id }]}
      descricao="Tela reservada para o detalhamento da venda selecionada."
      acoes={<CodigoBadge codigo={id} />}
    >
      <NotaDemonstracao>
        As regras e o detalhamento de venda pertencem ao <strong>MARIELA PDV</strong>. Esta tela será
        preenchida quando o contrato de vendas estiver disponível.
      </NotaDemonstracao>
      <EmDesenvolvimento modulo="Detalhe da venda" />
    </Page>
  );
}
