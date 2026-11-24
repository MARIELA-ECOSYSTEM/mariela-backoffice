import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_APROVACAO_TEMPLATE,
  ROTULO_ESTADO_MENSAGEM,
  TOM_ESTADO_MENSAGEM,
} from "@/services/whatsapp/envio-oficial";
import type {
  EstadoAprovacaoTemplateWhatsapp,
  EstadoMensagemWhatsapp,
} from "@/types/whatsapp-oficial";

/** Estado exatamente como veio do backend — só o rótulo é traduzido. */
export function EstadoMensagemBadge({ estado }: { estado: EstadoMensagemWhatsapp }) {
  return (
    <Badge variant={TOM_ESTADO_MENSAGEM[estado]} data-estado={estado}>
      {ROTULO_ESTADO_MENSAGEM[estado]}
    </Badge>
  );
}

export function AprovacaoTemplateBadge({ estado }: { estado: EstadoAprovacaoTemplateWhatsapp }) {
  const variante =
    estado === "APROVADO"
      ? "success"
      : estado === "REJEITADO" || estado === "DESATIVADO" || estado === "DIVERGENTE"
        ? "destructive"
        : estado === "DESCONHECIDO" || estado === "NAO_ENCONTRADO"
          ? "outline"
          : "warning";
  return (
    <Badge variant={variante} data-aprovacao={estado}>
      {ROTULO_APROVACAO_TEMPLATE[estado]}
    </Badge>
  );
}

/** Aviso em destaque (advertência ou informação), no padrão visual das notas do Backoffice. */
export function Aviso({
  tom = "advertencia",
  titulo,
  children,
  testId,
}: {
  tom?: "advertencia" | "informacao" | "erro";
  titulo?: string;
  children: ReactNode;
  testId?: string;
}) {
  const classes =
    tom === "erro"
      ? "border-destructive/30 bg-destructive/[0.05]"
      : tom === "advertencia"
        ? "border-warning/40 bg-warning/10"
        : "border-primary/15 bg-primary-soft/30";
  const Icone = tom === "informacao" ? Info : AlertTriangle;
  return (
    <div
      role={tom === "informacao" ? "note" : "alert"}
      data-testid={testId}
      className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${classes}`}
    >
      <Icone
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${tom === "erro" ? "text-destructive" : tom === "advertencia" ? "text-warning-foreground" : "text-primary"}`}
      />
      <div className="min-w-0 space-y-1 leading-relaxed">
        {titulo ? <p className="font-medium text-foreground">{titulo}</p> : null}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return (
    <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}
