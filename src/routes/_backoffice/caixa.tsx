import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { NotaDemonstracao } from "@/components/common/data-toolbar";
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
      breadcrumbs={[{ label: "Operação" }, { label: "Caixa" }]}
      descricao="Área reservada para a operação de caixa da loja física."
    >
      <NotaDemonstracao>
        Abertura, fechamento e movimentações serão operados pelo <strong>MARIELA PDV</strong>. Esta
        tela permanece preparada para a integração futura.
      </NotaDemonstracao>
      <EmDesenvolvimento modulo="Caixa" />
    </Page>
  );
}
