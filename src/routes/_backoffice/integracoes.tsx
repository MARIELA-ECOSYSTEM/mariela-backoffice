import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardsSkeleton, DataToolbar, NotaDemonstracao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { WhatsappManagementDialog } from "@/components/integracoes/whatsapp-management-dialog";
import { useIntegracoes } from "@/hooks/use-integracoes";
import type { StatusIntegracao } from "@/types/integracao";

/** Única integração com uma tela de gerenciamento real nesta etapa — as demais permanecem catálogo/planejadas. */
const ID_INTEGRACAO_WHATSAPP = "int_whatsapp";

export const Route = createFileRoute("/_backoffice/integracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Integrações — MARIELA Backoffice" },
      { name: "description", content: "Integrações com PDV, e-commerce e serviços externos." },
      { property: "og:title", content: "Integrações — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Integrações com PDV, e-commerce e serviços externos.",
      },
    ],
  }),
  component: IntegracoesPage,
});

const STATUS: Record<
  StatusIntegracao,
  { label: string; variante: "success" | "outline" | "gold" }
> = {
  conectada: { label: "Conectada", variante: "success" },
  disponivel: { label: "Disponível", variante: "gold" },
  planejada: { label: "Planejada", variante: "outline" },
};

function IntegracoesPage() {
  const { data: integracoes, isPending, isError, error, refetch } = useIntegracoes();
  const [busca, setBusca] = useState("");
  const [whatsappAberto, setWhatsappAberto] = useState(false);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return integracoes ?? [];
    return (integracoes ?? []).filter(
      (integracao) =>
        integracao.nome.toLowerCase().includes(termo) ||
        integracao.categoria.toLowerCase().includes(termo) ||
        integracao.descricao.toLowerCase().includes(termo),
    );
  }, [integracoes, busca]);

  return (
    <Page
      titulo="Integrações"
      breadcrumbs={[{ label: "Integrações" }]}
      descricao="Catálogo de integrações previstas para o ecossistema MARIELA."
    >
      <NotaDemonstracao>
        WhatsApp já é uma integração real (Evolution API / Baileys) — use "Gerenciar" no card abaixo.
        As demais integrações seguem apenas como catálogo, servido por <code>/integracoes</code>.
      </NotaDemonstracao>

      <DataToolbar busca={busca} onBuscaChange={setBusca} placeholder="Buscar integração…" />

      {isPending ? (
        <CardsSkeleton itens={6} altura={180} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma integração encontrada"
          descricao="Ajuste a busca para ver as integrações disponíveis e planejadas."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((integracao) => {
            const status = STATUS[integracao.status];
            return (
              <Card key={integracao.id} className="flex flex-col shadow-card">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary-soft">
                      <Plug aria-hidden className="size-5 text-primary" />
                    </div>
                    <Badge variant={status.variante}>{status.label}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-eyebrow">{integracao.categoria}</p>
                    <h3 className="font-display text-2xl leading-tight">{integracao.nome}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {integracao.descricao}
                    </p>
                  </div>
                  <p className="rounded-lg border border-border bg-surface/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    {integracao.observacao}
                  </p>
                  <div className="mt-auto">
                    {integracao.id === ID_INTEGRACAO_WHATSAPP ? (
                      <Button variant="outline" className="w-full" onClick={() => setWhatsappAberto(true)}>
                        Gerenciar
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        {integracao.status === "conectada" ? "Gerenciar" : "Conectar"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <WhatsappManagementDialog open={whatsappAberto} onOpenChange={setWhatsappAberto} />
    </Page>
  );
}
