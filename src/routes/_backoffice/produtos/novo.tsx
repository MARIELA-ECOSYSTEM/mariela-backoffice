import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { ProdutoForm } from "@/components/produtos/produto-form";
import { GaleriaFotosProduto } from "@/components/produtos/fotos/galeria-fotos-produto";
import { SeletorFotos } from "@/components/produtos/fotos/seletor-fotos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilaFotos } from "@/hooks/use-fila-fotos";
import { useGaleria } from "@/hooks/use-galeria";
import { useCriarProduto } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import type { ProdutoFormValues } from "@/schemas/produto.schema";
import type { Produto } from "@/types/produto";

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

/**
 * Fase 22.8.9.9.4 (M3) — as fotos podem ser escolhidas ANTES de salvar (só seleção e pré-visualização). Ao criar:
 * 1) o produto é criado UMA vez; 2) com o id confirmado, a galeria é liberada e as fotos escolhidas são enviadas.
 * Se o cadastro falhar, nada é enviado (a seleção continua). Se uma foto falhar, o produto NÃO é criado de novo: a tela
 * passa a ser a galeria do produto já criado, onde a foto pode ser reenviada.
 */
function NovoProdutoPage() {
  const navigate = useNavigate();
  const criar = useCriarProduto();
  const [criado, setCriado] = useState<Produto | null>(null);
  const { data: galeria } = useGaleria(criado?.id ?? "");
  const imagensNaGaleria = galeria?.midias.filter((m) => m.tipo === "image").length ?? 0;
  const fila = useFilaFotos({ imagensNaGaleria });
  const enviouRef = useRef(false);

  async function onSubmit(values: ProdutoFormValues) {
    if (criado) return; // nunca cria o mesmo produto duas vezes
    try {
      const produto = await criar.mutateAsync(values);
      toast.success("Produto criado com sucesso.");
      if (fila.fila.length === 0) {
        void navigate({ to: "/produtos/$id", params: { id: produto.id } });
        return;
      }
      setCriado(produto);
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível criar o produto."));
      throw error;
    }
  }

  // Produto confirmado pelo backend: só agora as fotos escolhidas são enviadas (uma vez, por decisão do operador ao
  // clicar em "Criar produto").
  useEffect(() => {
    if (criado && !enviouRef.current) {
      enviouRef.current = true;
      void fila.enviarTodos(criado.id);
    }
  }, [criado, fila]);

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
      <div className="max-w-4xl space-y-6">
        {criado ? (
          <>
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 aria-hidden className="size-4 text-success" />
                Produto <strong>{criado.nome}</strong> criado. As fotos escolhidas estão sendo
                enviadas para a galeria.
              </p>
              <Button asChild size="sm">
                <Link to="/produtos/$id" params={{ id: criado.id }}>
                  Ver produto <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </div>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Fotos</CardTitle>
              </CardHeader>
              <CardContent>
                <GaleriaFotosProduto produto={criado} fila={fila} />
              </CardContent>
            </Card>
          </>
        ) : (
          <ProdutoForm
            onSubmit={onSubmit}
            enviando={criar.isPending}
            onCancel={() => void navigate({ to: "/produtos" })}
            secaoExtra={
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Fotos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    As fotos escolhidas aqui são enviadas depois que o produto for criado.
                  </p>
                  <SeletorFotos fila={fila} produtoId={null} imagensNaGaleria={0} />
                </CardContent>
              </Card>
            }
          />
        )}
      </div>
    </Page>
  );
}
