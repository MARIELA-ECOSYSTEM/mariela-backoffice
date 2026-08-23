import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarPessoa } from "@/components/common/pessoa-card";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import { useVendasDoCliente } from "@/hooks/use-cadastros";
import { formatarData, formatarMoeda } from "@/utils/format";
import { idade, numeroWhatsapp, rotuloUltimaCompra } from "@/utils/cliente";
import { LABEL_STATUS_VENDA } from "@/types/venda";
import type { Cliente } from "@/types/cliente";

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="max-w-[60%] text-right">{valor || "—"}</dd>
    </div>
  );
}

/** Ficha do cliente: dados cadastrais, resumo de compras e histórico de vendas. */
export function ClienteDetalhe({
  cliente,
  onOpenChange,
}: {
  cliente: Cliente | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const vendas = useVendasDoCliente(cliente?.id ?? null);
  const anos = idade(cliente?.dataNascimento ?? null);

  return (
    <Sheet open={cliente !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-3xl">{cliente?.nome}</SheetTitle>
          <SheetDescription>Ficha da cliente e histórico de compras.</SheetDescription>
        </SheetHeader>

        {cliente ? (
          <div className="space-y-6 px-4 pb-8">
            <div className="flex items-center gap-4">
              <AvatarPessoa nome={cliente.nome} foto={cliente.foto} className="size-16" />
              <div className="space-y-1.5">
                <CodigoBadge codigo={cliente.codigo} />
                <div>
                  <BotaoWhatsapp
                    nome={cliente.nome}
                    numero={numeroWhatsapp(cliente)}
                    variante="botao"
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-eyebrow mb-3">Resumo</p>
              <dl className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5">
                  <dt className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Compras
                  </dt>
                  <dd className="font-display text-xl text-primary">{cliente.compras}</dd>
                </div>
                <div className="rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5">
                  <dt className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Total comprado
                  </dt>
                  <dd className="font-display text-xl text-primary">
                    {formatarMoeda(cliente.totalComprado)}
                  </dd>
                </div>
                <div className="rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5">
                  <dt className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Última compra
                  </dt>
                  <dd className="text-sm text-foreground/90">
                    {rotuloUltimaCompra(cliente.ultimaCompra)}
                  </dd>
                </div>
              </dl>
            </div>

            <dl className="space-y-3 text-sm">
              <Linha rotulo="Telefone" valor={cliente.telefone} />
              <Linha rotulo="WhatsApp" valor={cliente.whatsapp || cliente.telefone} />
              <Linha
                rotulo="Nascimento"
                valor={
                  cliente.dataNascimento
                    ? `${formatarData(cliente.dataNascimento)}${anos === null ? "" : ` · ${anos} anos`}`
                    : "—"
                }
              />
              <Linha rotulo="Cadastro" valor={formatarData(cliente.criadoEm)} />
              <Linha rotulo="Observação" valor={cliente.observacao} />
            </dl>

            <div>
              <p className="text-eyebrow mb-3">Histórico de compras</p>
              {vendas.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </div>
              ) : !vendas.data?.length ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Esta cliente ainda não realizou compras.
                </p>
              ) : (
                <ul className="space-y-2">
                  {vendas.data.map((venda) => (
                    <li
                      key={venda.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          Venda {venda.numero}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatarData(venda.dataVenda)} · {venda.totalItens} item(ns) ·{" "}
                          {venda.formaPagamento}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums text-foreground">
                          {formatarMoeda(venda.valorFinal)}
                        </p>
                        <Badge variant={venda.status === "concluida" ? "success" : "outline"}>
                          {LABEL_STATUS_VENDA[venda.status]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
