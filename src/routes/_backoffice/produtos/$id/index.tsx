import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Image as ImageIcon, Pencil, Percent, Trash2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge, TagBadge } from "@/components/common/status-badge";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PromocaoDialog } from "@/components/produtos/promocao-dialog";
import { GaleriaProduto } from "@/components/produtos/galeria-produto";
import { GerenciarVariantes } from "@/components/produtos/gerenciar-variantes";
import { useDefinirPromocao, useExcluirProduto, useProduto } from "@/hooks/use-produtos";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { formatarData, formatarMoeda, formatarPercentual, pluralizar } from "@/utils/format";
import { lucroFinal, margemVigente, precoFinal } from "@/utils/produto";
import { mensagemDeErro } from "@/services/api/client";
import type { Produto } from "@/types/produto";

export const Route = createFileRoute("/_backoffice/produtos/$id/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhes do produto — MARIELA Backoffice" },
      {
        name: "description",
        content: "Galeria, preços, lucro, margem, estoque por cor e tamanho e variantes.",
      },
      { property: "og:title", content: "Detalhes do produto — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Galeria, preços, lucro, margem, estoque por cor e tamanho e variantes.",
      },
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

function LinhaValor({
  label,
  valor,
  riscado,
  destaque,
}: {
  label: string;
  valor: string;
  riscado?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={[
          "tabular-nums",
          destaque ? "font-display text-2xl text-foreground" : "text-sm",
          riscado ? "text-muted-foreground line-through" : "",
        ].join(" ")}
      >
        {valor}
      </span>
    </div>
  );
}

/** Estoque por cor e tamanho — sempre derivado das variantes do produto. */
function EstoquePorVariante({ produto }: { produto: Produto }) {
  if (!produto.variantes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma variante cadastrada. Cadastre as cores para controlar o estoque.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {produto.variantes.map((variante) => (
        <div
          key={variante.id}
          className="flex gap-3 rounded-xl border border-border bg-surface/50 p-3"
        >
          <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
            {variante.foto ? (
              <img
                src={variante.foto}
                alt={variante.cor}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-primary-soft/60 text-primary/60">
                <ImageIcon aria-hidden className="size-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="truncate text-sm font-medium">{variante.cor}</p>
              <span className="shrink-0 font-display text-lg tabular-nums">
                {variante.quantidadeVariante}
              </span>
            </div>
            <CodigoBadge codigo={variante.codVariante} tamanho="xs" />
            <div className="flex flex-wrap gap-1">
              {variante.tamanhos.length === 0 ? (
                <span className="text-xs text-muted-foreground">Sem tamanhos.</span>
              ) : (
                variante.tamanhos.map((tamanho) => (
                  <Badge
                    key={tamanho.id}
                    variant="outline"
                    className={
                      tamanho.quantidade === 0
                        ? "border-border text-muted-foreground"
                        : "border-primary/25 bg-primary-soft/50 text-primary"
                    }
                  >
                    {tamanho.tamanho} — <span className="tabular-nums">{tamanho.quantidade}</span>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      ))}
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
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          fallback="Produto não encontrado."
        />
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
      await excluir.mutateAsync(id);
      toast.success("Produto excluído com sucesso.");
      void navigate({ to: "/produtos" });
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o produto."));
    }
  }

  const colecao = colecoes?.find((item) => item.id === produto.colecaoId)?.nome ?? "—";
  const campanha = campanhas?.find((item) => item.id === produto.campanhaId)?.nome ?? "—";
  const fornecedor = fornecedores?.find((item) => item.id === produto.fornecedorId)?.nome ?? "—";
  const preco = precoFinal(produto);
  const lucro = lucroFinal(produto);
  const margem = margemVigente(produto);

  return (
    <Page
      titulo={produto.nome}
      breadcrumbs={[
        { label: "Catálogo" },
        { label: "Produtos", to: "/produtos" },
        { label: produto.codProduto },
      ]}
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
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setExclusaoAberta(true)}
          >
            <Trash2 aria-hidden className="size-4" /> Excluir
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,18rem)]">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="font-display text-xl">Galeria de fotos</CardTitle>
            </CardHeader>
            <CardContent>
              <GaleriaProduto produto={produto} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <CardTitle className="font-display text-xl">Informações gerais</CardTitle>
              <CodigoBadge codigo={produto.codProduto} />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-3">
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
                <Info label="Variantes" valor={String(produto.variantes.length)} />
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-2">
                <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
                {produto.ehNovidade ? <TagBadge tom="primary">Novidade</TagBadge> : null}
                {produto.ehPromocao ? <TagBadge tom="gold">Promoção ativa</TagBadge> : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Financeiro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <LinhaValor label="Custo" valor={formatarMoeda(produto.precoCusto)} />
                <LinhaValor
                  label={produto.ehPromocao ? "Preço normal" : "Venda"}
                  valor={formatarMoeda(produto.precoVenda)}
                  riscado={produto.ehPromocao}
                />
                {produto.ehPromocao ? (
                  <LinhaValor
                    label="Preço promocional"
                    valor={formatarMoeda(produto.precoPromocional ?? null)}
                  />
                ) : null}
                <Separator />
                <LinhaValor label="Preço vigente" valor={formatarMoeda(preco)} destaque />
                <LinhaValor label="Lucro" valor={formatarMoeda(lucro)} />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Margem</span>
                  <Badge
                    variant="outline"
                    className="border-primary/25 bg-primary-soft/50 tabular-nums text-primary"
                  >
                    {formatarPercentual(margem)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-xl">Estoque</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-display text-4xl leading-none tabular-nums">
                  {produto.quantidadeTotal}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralizar(produto.quantidadeTotal, "peça", "peças")} somando todas as variantes
                  e tamanhos
                </p>
                <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-display text-xl">Estoque por cor e tamanho</CardTitle>
          </CardHeader>
          <CardContent>
            <EstoquePorVariante produto={produto} />
          </CardContent>
        </Card>

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
