import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { ProdutoForm } from "@/components/produtos/produto-form";
import { useCriarProduto } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import type { ProdutoFormValues } from "@/schemas/produto.schema";

export const Route = createFileRoute("/_backoffice/produtos/novo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Novo produto — MARIELA Backoffice" },
      { name: "description", content: "Cadastro de um novo produto no catálogo Mariela." },
      { property: "og:title", content: "Novo produto — MARIELA Backoffice" },
      { property: "og:description", content: "Cadastro de um novo produto no catálogo Mariela." },
    ],
  }),
  component: NovoProdutoPage,
});

function NovoProdutoPage() {
  const navigate = useNavigate();
  const criar = useCriarProduto();

  async function onSubmit(values: ProdutoFormValues) {
    try {
      const produto = await criar.mutateAsync(values);
      toast.success("Produto criado com sucesso.");
      void navigate({ to: "/produtos/$id", params: { id: produto.id } });
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível criar o produto."));
    }
  }

  return (
    <Page
      titulo="Novo produto"
      breadcrumbs={[
        { label: "Catálogo" },
        { label: "Produtos", to: "/produtos" },
        { label: "Novo" },
      ]}
      descricao="O cadastro inicial não cria estoque. Depois de salvar, adicione as variantes por cor e os tamanhos."
    >
      <div className="max-w-4xl">
        <ProdutoForm
          onSubmit={onSubmit}
          enviando={criar.isPending}
          onCancel={() => void navigate({ to: "/produtos" })}
        />
      </div>
    </Page>
  );
}
