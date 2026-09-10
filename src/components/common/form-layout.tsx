import type { FormEventHandler, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Camada puramente visual dos formulários de cadastro do backoffice.
 * Nenhum destes componentes conhece schema, mutation ou payload: recebem
 * apenas o que renderizar. A lógica continua inteiramente nos dialogs.
 */

/** Corpo rolável de formulário dentro de um Dialog, com espaçamento único. */
export function CorpoFormulario({
  id,
  onSubmit,
  children,
  className,
}: {
  id: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      id={id}
      noValidate
      onSubmit={onSubmit}
      className={cn("-mx-1 max-h-[62vh] space-y-6 overflow-y-auto px-1 py-0.5", className)}
    >
      {children}
    </form>
  );
}

/** Agrupamento lógico de campos, com título discreto e descrição opcional. */
export function SecaoFormulario({
  titulo,
  descricao,
  destaque = false,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  /** Realce suave para seções de conteúdo (ex.: vitrine). */
  destaque?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "space-y-4 rounded-xl border p-4",
        destaque ? "border-primary/20 bg-primary-soft/30" : "border-border bg-surface/40",
        className,
      )}
    >
      <legend className="px-1.5 font-brand text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
        {titulo}
      </legend>
      {descricao ? (
        <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

/** Linha de alternância (switch) com rótulo, ícone e descrição opcionais. */
export function AlternadorCampo({
  id,
  titulo,
  descricao,
  icone,
  checked,
  onChange,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  checked: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="flex items-center gap-2">
          {icone}
          {titulo}
        </Label>
        {descricao ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Rodapé padrão dos dialogs de formulário: ação primária evidente à direita,
 * cancelar secundário, loading perceptível. Apenas apresentação — o submit
 * continua sendo do `<form id>` correspondente.
 */
export function AcoesFormulario({
  formId,
  salvando,
  onCancelar,
  rotuloSalvar = "Salvar",
  rotuloSalvando = "Salvando…",
}: {
  formId: string;
  salvando: boolean;
  onCancelar: () => void;
  rotuloSalvar?: string;
  rotuloSalvando?: string;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} disabled={salvando} className="sm:min-w-36">
        {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {salvando ? rotuloSalvando : rotuloSalvar}
      </Button>
    </>
  );
}
