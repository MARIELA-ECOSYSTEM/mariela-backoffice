import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { tamanhoSchema, type TamanhoFormValues } from "@/schemas/produto.schema";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useAdicionarTamanho } from "@/hooks/use-variantes";
import { mensagemDeErro } from "@/services/api/client";
import { ApiError } from "@/types/api";
import type { Variante } from "@/types/variante";

export function TamanhoDialog({
  produtoId,
  variante,
  open,
  onOpenChange,
}: {
  produtoId: string;
  variante: Variante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const adicionar = useAdicionarTamanho(produtoId);

  const form = useForm<TamanhoFormValues>({
    resolver: zodResolver(tamanhoSchema),
    defaultValues: { tamanho: "", quantidade: 0 },
  });

  useEffect(() => {
    if (open) form.reset({ tamanho: "", quantidade: 0 });
  }, [open, form]);

  const disponiveis = (configuracoes?.tamanhos ?? []).filter(
    (tamanho) => !(variante?.tamanhos ?? []).some((t) => t.tamanho === tamanho),
  );

  async function onSubmit(values: TamanhoFormValues) {
    if (!variante) return;
    try {
      await adicionar.mutateAsync({ varianteId: variante.id, payload: values });
      toast.success("Tamanho adicionado com sucesso.");
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        error.errors.forEach((campo) => {
          if (campo.field === "tamanho" || campo.field === "quantidade") {
            form.setError(campo.field, { message: campo.message });
          }
        });
      }
      toast.error(mensagemDeErro(error, "Não foi possível adicionar o tamanho."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Adicionar tamanho</DialogTitle>
          <DialogDescription>
            Variante {variante?.cor ?? "—"}. Use <strong>U</strong> para produtos de tamanho único.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field id="tamanho" label="Tamanho" erro={form.formState.errors.tamanho?.message}>
            <Select
              value={form.watch("tamanho")}
              onValueChange={(valor) => form.setValue("tamanho", valor, { shouldValidate: true })}
            >
              <SelectTrigger id="tamanho" aria-label="Tamanho">
                <SelectValue placeholder="Selecione o tamanho" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((tamanho) => (
                  <SelectItem key={tamanho} value={tamanho}>
                    {tamanho}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="quantidade"
            label="Quantidade inicial"
            erro={form.formState.errors.quantidade?.message}
            hint="Pode ser zero. O estoque também pode ser lançado depois por entrada."
          >
            <Input id="quantidade" type="number" min="0" step="1" {...form.register("quantidade")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={adicionar.isPending}>
              {adicionar.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
