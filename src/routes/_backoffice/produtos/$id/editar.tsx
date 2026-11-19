import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { ProdutoForm } from "@/components/produtos/produto-form";
import { GaleriaFotosProduto } from "@/components/produtos/fotos/galeria-fotos-produto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { useAtualizarProduto, useProduto } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import type { ProdutoFormValues } from "@/schemas/produto.schema";

export const Route = createFileRoute("/_backoffice/produtos/$id/editar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Editar produto — MARIELA Backoffice" },
      { name: "description", content: "Edição dos dados cadastrais e de preço do produto." },
      { property: "og:title", content: "Editar produto — MARIELA Backoffice" },
      { property: "og:description", content: "Edição dos dados cadastrais e de preço do produto." },
    ],
  }),
  component: EditarProdutoPage,
});

function EditarProdutoPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: produto, isPending, isError, error, refetch } = useProduto(id);
  const atualizar = useAtualizarProduto(id);

  async function onSubmit(values: ProdutoFormValues) {
    try {
      await atualizar.mutateAsync(values);
      toast.success("Produto atualizado com sucesso.");
      void navigate({ to: "/produtos/$id", params: { id } });
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível atualizar o produto."));
      throw err;
    }
  }

  return (
    <Page
      titulo={produto ? `Editar ${produto.nome}` : "Editar produto"}
      breadcrumbs={[
        { label: "Catálogo" },
        { label: "Produtos", to: "/produtos" },
        { label: "Editar" },
      ]}
    >
      <div className="max-w-4xl space-y-6">
        {isPending ? (
          <TableSkeleton linhas={6} colunas={2} />
        ) : isError || !produto ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <>
            <ProdutoForm
              produto={produto}
              onSubmit={onSubmit}
              enviando={atualizar.isPending}
              onCancel={() => void navigate({ to: "/produtos/$id", params: { id } })}
            />
            {/* Fase 22.8.9.9.4 (M3) — fotos independentes do formulário: cada ação vale na hora, e uma falha de envio
                nunca descarta as alterações já salvas do produto (nem o contrário). */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Fotos</CardTitle>
              </CardHeader>
              <CardContent>
                <GaleriaFotosProduto produto={produto} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
