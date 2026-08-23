import { Link } from "@tanstack/react-router";
import { CalendarRange, Image as ImageIcon, LayoutPanelTop, Package, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { EmptyState } from "@/components/common/states";
import { formatarData, formatarMoeda } from "@/utils/format";
import { fotosDoProduto, precoFinal } from "@/utils/produto";
import { LABEL_VIGENCIA, statusVigencia } from "@/utils/vitrine";
import type { ItemPeriodo } from "@/components/cadastros/periodo-card";
import type { Produto } from "@/types/produto";

function Imagem({
  url,
  titulo,
  proporcao,
  vazio,
}: {
  url: string | null;
  titulo: string;
  proporcao: string;
  vazio: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-brand text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
        {titulo}
      </p>
      <div
        className={`overflow-hidden rounded-xl border border-border bg-primary-soft/40 ${proporcao}`}
      >
        {url ? (
          <img src={url} alt={titulo} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-primary/50">
            <ImageIcon aria-hidden className="size-6" />
            <span className="text-xs">{vazio}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Detalhe compartilhado de Coleção e Campanha, com produtos vinculados em grade. */
export function DetalhePeriodo({
  item,
  tipo,
  produtos,
}: {
  item: ItemPeriodo;
  tipo: "colecao" | "campanha";
  produtos: Produto[];
}) {
  const status = statusVigencia(item);
  const rotuloTipo = tipo === "colecao" ? "Coleção" : "Campanha";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                status === "ativa"
                  ? "success"
                  : status === "agendada"
                    ? "gold"
                    : status === "encerrada"
                      ? "outline"
                      : "destructive"
              }
            >
              {LABEL_VIGENCIA[status]}
            </Badge>
            <Badge variant="secondary">{rotuloTipo}</Badge>
            {item.destaque ? (
              <Badge variant="gold">
                <Sparkles aria-hidden className="size-3" />
                Destaque
              </Badge>
            ) : null}
            {item.banner ? (
              <Badge variant="outline">
                <LayoutPanelTop aria-hidden className="size-3" />
                Banner
              </Badge>
            ) : null}
            <CodigoBadge codigo={item.codigo} />
          </div>

          <div>
            <h2 className="font-display text-3xl leading-tight">{item.nome}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {item.descricao || "Sem descrição."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarRange aria-hidden className="size-4 text-primary/70" />
              {formatarData(item.inicio)} — {formatarData(item.fim)}
            </span>
            <span className="flex items-center gap-2">
              <Package aria-hidden className="size-4 text-primary/70" />
              {produtos.length} produto{produtos.length === 1 ? "" : "s"} vinculado
              {produtos.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-[minmax(0,14rem)_1fr]">
            <Imagem
              url={item.fotoDestaque}
              titulo="Foto de destaque"
              proporcao="aspect-[4/5]"
              vazio="Não definida"
            />
            <Imagem
              url={item.fotoBanner}
              titulo="Foto de banner"
              proporcao="aspect-[16/6]"
              vazio="Não definida"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtos vinculados</CardTitle>
        </CardHeader>
        <CardContent>
          {produtos.length === 0 ? (
            <EmptyState
              titulo="Nenhum produto vinculado"
              descricao={`Defina esta ${rotuloTipo.toLowerCase()} no cadastro do produto para vinculá-lo.`}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {produtos.map((produto) => {
                const capa = fotosDoProduto(produto)[0]?.url ?? null;
                return (
                  <Link
                    key={produto.id}
                    to="/produtos/$id"
                    params={{ id: produto.id }}
                    className="group overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all hover:border-primary/30 hover:shadow-elevated"
                  >
                    <div className="aspect-[3/4] overflow-hidden bg-primary-soft/30">
                      {capa ? (
                        <img
                          src={capa}
                          alt={produto.nome}
                          loading="lazy"
                          className="size-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-primary/40">
                          <ImageIcon aria-hidden className="size-6" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium">{produto.nome}</p>
                      <p className="text-xs text-muted-foreground">{produto.categoria}</p>
                      <p className="font-display text-base text-primary">
                        {formatarMoeda(precoFinal(produto))}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
