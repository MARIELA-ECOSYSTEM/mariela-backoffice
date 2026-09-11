import type { ReactNode } from "react";
import { Eye, MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

/** Iniciais para o avatar (no máximo duas letras). */
export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0);
  if (partes.length === 0) return "—";
  const primeira = partes[0]![0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

export function AvatarPessoa({
  nome,
  foto,
  className = "size-11",
}: {
  nome: string;
  foto?: string | null | undefined;
  className?: string | undefined;
}) {
  return (
    <Avatar className={`${className} border border-border bg-primary-soft/60`}>
      {foto ? <AvatarImage src={foto} alt={nome} /> : null}
      <AvatarFallback className="bg-primary-soft/60 font-display text-base text-primary">
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

export interface PessoaCampo {
  icon: LucideIcon;
  label: string;
  valor: string;
}

export interface PessoaAcao {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destrutivo?: boolean;
  separarAntes?: boolean;
}

export interface PessoaMetrica {
  label: string;
  valor: string;
  /** Destaca o valor (usado em Total Comprado, por exemplo). */
  destaque?: boolean;
}

/**
 * Card padrão para pessoas (clientes, fornecedores e vendedores).
 * Puramente apresentacional: regras de negócio ficam nos hooks/services.
 */
export function PessoaCard({
  nome,
  foto,
  ativo,
  subtitulo,
  campos,
  metricas,
  observacao,
  rodape,
  acaoRapida,
  onVisualizar,
  acoes,
  badgeExtra,
}: {
  nome: string;
  foto?: string | null | undefined;
  /** Quando omitido, o card não exibe badge de status (caso de Clientes). */
  ativo?: boolean | undefined;
  subtitulo?: string | undefined;
  campos: PessoaCampo[];
  /** Pequena área de métricas dentro do card. */
  metricas?: PessoaMetrica[] | undefined;
  observacao?: string | undefined;
  rodape?: ReactNode;
  /** Ação visual em destaque no topo do card (ex.: WhatsApp). */
  acaoRapida?: ReactNode;
  onVisualizar: () => void;
  acoes: PessoaAcao[];
  badgeExtra?: ReactNode;
}) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-xl shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <AvatarPessoa nome={nome} foto={foto} />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onVisualizar}
              title={nome}
              className="block max-w-full truncate rounded-sm text-left font-display text-xl font-medium leading-tight text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {nome}
            </button>
            {subtitulo ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</p>
            ) : null}
            {ativo !== undefined || badgeExtra ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {ativo === undefined ? null : (
                  <Badge variant={ativo ? "success" : "outline"}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
                    {ativo ? "Ativo" : "Inativo"}
                  </Badge>
                )}
                {badgeExtra}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {acaoRapida}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Ações de ${nome}`}>
                  <MoreVertical aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onVisualizar}>
                  <Eye aria-hidden className="size-4" />
                  Visualizar
                </DropdownMenuItem>
                {acoes.map((acao) => (
                  <div key={acao.label}>
                    {acao.separarAntes ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      onClick={acao.onClick}
                      className={acao.destrutivo ? "text-destructive" : undefined}
                    >
                      <acao.icon aria-hidden className="size-4" />
                      {acao.label}
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <dl className="space-y-1.5 text-sm">
          {campos.map((campo) => (
            <div key={campo.label} className="flex items-center gap-2">
              <campo.icon aria-hidden className="size-3.5 shrink-0 text-primary/70" />
              <dt className="sr-only">{campo.label}</dt>
              <dd className="truncate text-foreground/80">{campo.valor || "—"}</dd>
            </div>
          ))}
        </dl>

        {metricas?.length ? (
          <dl className="grid grid-cols-3 gap-2 rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5">
            {metricas.map((metrica) => (
              <div key={metrica.label} className="min-w-0">
                <dt className="font-brand text-[0.72rem] uppercase leading-tight tracking-[0.08em] text-muted-foreground">
                  {metrica.label}
                </dt>
                <dd
                  className={
                    metrica.destaque
                      ? "mt-0.5 font-display text-base leading-tight text-primary"
                      : "mt-0.5 text-[0.85rem] leading-tight text-foreground/90"
                  }
                  title={metrica.valor}
                >
                  {metrica.valor}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {observacao ? (
          <p className="line-clamp-2 rounded-lg bg-primary-soft/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {observacao}
          </p>
        ) : null}

        {rodape ? <div className="mt-auto pt-1">{rodape}</div> : null}
      </CardContent>
    </Card>
  );
}

/** Grid responsivo padrão de cards de pessoa: 2 / 3 / 4 colunas. */
export function PessoaGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}

/** Skeleton do grid de pessoas. */
export function GridSkeleton({ itens = 8 }: { itens?: number }) {
  return (
    <PessoaGrid>
      {Array.from({ length: itens }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </PessoaGrid>
  );
}
