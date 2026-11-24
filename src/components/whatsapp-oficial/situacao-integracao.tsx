import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/common/states";
import { useTemplatesWhatsapp } from "@/hooks/use-whatsapp-oficial";
import { avaliarSituacaoIntegracao } from "@/services/whatsapp/envio-oficial";
import { AprovacaoTemplateBadge, Aviso, Rotulo } from "./comum";

/**
 * Situação do WhatsApp oficial (Cloud API da Meta), com base SÓ no que o backend informa: o backend não tem rota de
 * "status" para este fluxo, então a disponibilidade é a confirmação de aprovação dos modelos (`GET /templates`), que o
 * próprio backend consulta no provedor. Nunca mostra QR Code nem "conectado": sem confirmação, aparece "não
 * confirmada".
 */
export function SituacaoIntegracao() {
  const templates = useTemplatesWhatsapp();

  if (templates.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Consultando o backend…
      </div>
    );
  }
  if (templates.isError) {
    return (
      <ErrorState
        error={templates.error}
        onRetry={() => void templates.refetch()}
        fallback="Não foi possível consultar a situação do WhatsApp oficial."
      />
    );
  }

  const situacao = avaliarSituacaoIntegracao(templates.data);

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <Rotulo>Envio por modelo (Meta Cloud API)</Rotulo>
              <div className="flex items-center gap-2">
                <Badge
                  variant={situacao.tom}
                  data-testid="situacao-integracao"
                  data-situacao={situacao.tipo}
                >
                  {situacao.rotulo}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">{situacao.descricao}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={templates.isFetching}
              onClick={() => void templates.refetch()}
            >
              {templates.isFetching ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <RefreshCw aria-hidden className="size-4" />
              )}
              Atualizar
            </Button>
          </div>

          <div className="space-y-2">
            <Rotulo>Modelos do catálogo</Rotulo>
            {templates.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">O backend não informou nenhum modelo.</p>
            ) : (
              <ul
                className="divide-y divide-border rounded-lg border border-border"
                aria-label="Modelos de mensagem"
              >
                {templates.data.map((t) => (
                  <li key={t.chave} data-template={t.chave} className="space-y-1.5 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {t.chave}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {t.categoria === "MARKETING" ? "Marketing" : "Utilidade"} · {t.idioma}
                        </span>
                      </p>
                      <AprovacaoTemplateBadge estado={t.estadoAprovacao} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Uso:{" "}
                      {t.usoPermitido
                        .map((u) =>
                          u === "INDIVIDUAL" ? "envio individual" : "campanha de aniversário",
                        )
                        .join(", ")}
                    </p>
                    <p className="whitespace-pre-wrap rounded-md bg-surface/60 px-2 py-1.5 text-xs text-foreground">
                      {t.previa}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Aviso tom="informacao" titulo="Sobre esta integração">
        As mensagens são enviadas pelo backend, só para clientes cadastrados e só com modelos
        aprovados pela Meta. Não há QR Code: a conexão é configurada no servidor. O WhatsApp pela
        Evolution API continua disponível em Integrações enquanto durar a transição.
      </Aviso>
    </div>
  );
}
