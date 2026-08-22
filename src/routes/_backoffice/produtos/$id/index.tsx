import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil, Percent, Trash2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge, TagBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PromocaoDialog } from "@/components/produtos/promocao-dialog";
import { GerenciarVariantes } from "@/components/produtos/gerenciar-variantes";
import { useDefinirPromocao, useExcluirProduto, useProduto } from "@/hooks/use-produtos";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { formatarData, formatarMoeda, formatarPercentual } from "@/utils/format";
import { precoFinal } from "@/utils/produto";
import { mensagemDeErro } from "@/services/api/client";

export const Route = createFileRoute("/_backoffice/produtos/$id/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhes do produto — MARIELA Backoffice" },
      { name: "description", content: "Informações gerais, preços, margem, estoque e variantes do produto." },
      { property: "og:title", content: "Detalhes do produto — MARIELA Backoffice" },
      { property: "og:description", content: "Informações gerais, preços, margem, estoque e variantes do produto." },
    ],
  }),
  component: ProdutoDetalhePage,
});

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-eyebrow">{label}</p>
      <p className="mt-0.5 text-sm">{valor}</p>
    </div>
  );
}

function ProdutoDetalhePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: produto, isPending, isError, error, refetch } = useProduto(id);
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();
  const { data: fornecedores } = useFornecedores();
  const definirPromocao = useDefinirPromocao(id);
  const excluir = useExcluirProduto();
  const [promocaoAberta, setPromocaoAberta] = useState(false);
  const [exclusaoAberta, setExclusaoAberta] = useState(false);

  if (isPending) {
    return (
      <Page titulo="Produto" breadcrumbs={[{ label: "Produtos", to: "/produtos" }]}>
        <TableSkeleton linhas={6} colunas={3} />
      </Page>
    );
  }

  if (isError || !produto) {
    return (
      <Page titulo="Produto" breadcrumbs={[{ label: "Produtos", to: "/produtos" }]}>
        <ErrorState error={error} onRetry={() => void refetch()} fallback="Produto não encontrado." />
      </Page>
    );
  }

  async function desativarPromocao() {
    try {
      await definirPromocao.mutateAsync({ ehPromocao: false });
      toast.success("Promoção desativada com sucesso.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível desativar a promoção."));
    }
  }

  async function confirmarExclusao() {
    try {
      await excluir.mutateAsync(produto.id);
      toast.success("Produto excluído com sucesso.");
      void navigate({ to: "/produtos" });
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o produto."));
    }
  }

  const colecao = colecoes?.find((item) => item.id === produto.colecaoId)?.nome ?? "—";
  const campanha = campanhas?.find((item) => item.id === produto.campanhaId)?.nome ?? "—";
  const fornecedor = fornecedores?.find((item) => item.id === produto.fornecedorId)?.nome ?? "—";

  return (
    <Page
      titulo={produto.nome}
      breadcrumbs={[{ label: "Catálogo" }, { label: "Produtos", to: "/produtos" }, { label: produto.codProduto }]}
      descricao={produto.descricao || "Sem descrição cadastrada."}
      acoes={
        <>
          {produto.ehPromocao ? (
            <Button variant="outline" onClick={() => void desativarPromocao()}>
              <Percent aria-hidden className="size-4" /> Desativar promoção
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setPromocaoAberta(true)}>
              <Percent aria-hidden className="size-4" /> Ativar promoção
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/produtos/$id/editar" params={{ id: produto.id }}>
              <Pencil aria-hidden className="size-4" /> Editar
            </Link>
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={() => setExclusaoAberta(true)}>
            <Trash2 aria-hidden className="size-4" /> Excluir
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="shadow-card xl:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-xl">Informações gerais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-3">
              <Info label="Código" valor={produto.codProduto} />
              <Info label="Nome" valor={produto.nome} />
              <Info label="Categoria" valor={produto.categoria} />
              <Info label="Coleção" valor={colecao} />
              <Info label="Campanha" valor={campanha} />
              <Info label="Fornecedor" valor={fornecedor} />
              <Info label="Criado em" valor={formatarData(produto.criadoEm)} />
              <Info label="Atualizado em" valor={formatarData(produto.atualizadoEm)} />
              <Info
                label="Estoque zerado em"
                valor={produto.estoqueZeradoEm ? formatarData(produto.estoqueZeradoEm) : "—"}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Preços</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Preço de custo</span>
                  <span className="tabular-nums">{formatarMoeda(produto.precoCusto)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Preço de venda</span>
                  <span className={produto.ehPromocao ? "tabular-nums line-through text-muted-foreground" : "tabular-nums"}>
                    {formatarMoeda(produto.precoVenda)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Preço promocional</span>
                  <span className="tabular-nums">{formatarMoeda(produto.precoPromocional ?? null)}</span>
                </div>
                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Preço vigente</span>
                  <span className="font-display text-2xl">{formatarMoeda(precoFinal(produto))}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Margem</span>
                  <span className="tabular-nums">{formatarPercentual(produto.margemLucro)}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {produto.ehNovidade ? <TagBadge tom="primary">Novidade</TagBadge> : null}
                  {produto.ehPromocao ? <TagBadge tom="gold">Promoção ativa</TagBadge> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Estoque</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-display text-4xl leading-none">{produto.quantidadeTotal}</p>
                <p className="text-xs text-muted-foreground">
                  peças somando todas as variantes e tamanhos
                </p>
                <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
              </CardContent>
            </Card>
          </div>
        </div>

        <GerenciarVariantes produto={produto} />
      </div>

      <PromocaoDialog produto={produto} open={promocaoAberta} onOpenChange={setPromocaoAberta} />

      <ConfirmDialog
        open={exclusaoAberta}
        onOpenChange={setExclusaoAberta}
        titulo="Excluir produto"
        descricao={`Tem certeza que deseja excluir "${produto.nome}"? Esta ação não pode ser desfeita.`}
        confirmarLabel="Excluir"
        onConfirm={() => void confirmarExclusao()}
      />
    </Page>
  );
}
