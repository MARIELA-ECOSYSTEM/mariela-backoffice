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
import { varianteSchema, type VarianteFormValues } from "@/schemas/produto.schema";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useAtualizarVariante, useCriarVariante } from "@/hooks/use-variantes";
import { mensagemDeErro } from "@/services/api/client";
import { ApiError } from "@/types/api";
import type { Variante } from "@/types/variante";

export function VarianteDialog({
  produtoId,
  variante,
  open,
  onOpenChange,
}: {
  produtoId: string;
  variante?: Variante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const criar = useCriarVariante(produtoId);
  const atualizar = useAtualizarVariante(produtoId);
  const editando = Boolean(variante);

  const form = useForm<VarianteFormValues>({
    resolver: zodResolver(varianteSchema),
    defaultValues: { codVariante: "", cor: "", foto: "", video: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      codVariante: variante?.codVariante ?? "",
      cor: variante?.cor ?? "",
      foto: variante?.foto ?? "",
      video: variante?.video ?? "",
    });
  }, [open, variante, form]);

  async function onSubmit(values: VarianteFormValues) {
    const payload = {
      codVariante: values.codVariante,
      cor: values.cor,
      foto: values.foto ?? null,
      video: values.video ?? null,
    };
    try {
      if (variante) await atualizar.mutateAsync({ varianteId: variante.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(editando ? "Variante atualizada com sucesso." : "Variante criada com sucesso.");
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.errors.length) {
        error.errors.forEach((campo) => {
          if (campo.field === "cor" || campo.field === "codVariante") {
            form.setError(campo.field, { message: campo.message });
          }
        });
      }
      toast.error(mensagemDeErro(error, "Não foi possível salvar a variante."));
    }
  }

  const enviando = criar.isPending || atualizar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editando ? "Editar variante" : "Adicionar variante"}
          </DialogTitle>
          <DialogDescription>
            Cada variante representa uma cor do produto. Os tamanhos são adicionados em seguida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field id="codVariante" label="Código da variante" erro={form.formState.errors.codVariante?.message}>
            <Input id="codVariante" placeholder="PRD-0001-01" {...form.register("codVariante")} />
          </Field>

          <Field id="cor" label="Cor" erro={form.formState.errors.cor?.message}>
            <Select
              value={form.watch("cor")}
              onValueChange={(valor) => form.setValue("cor", valor, { shouldValidate: true })}
            >
              <SelectTrigger id="cor" aria-label="Cor">
                <SelectValue placeholder="Selecione a cor" />
              </SelectTrigger>
              <SelectContent>
                {(configuracoes?.cores ?? []).map((cor) => (
                  <SelectItem key={cor} value={cor}>
                    {cor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="foto" label="Foto (URL)" erro={form.formState.errors.foto?.message}>
            <Input id="foto" placeholder="https://..." {...form.register("foto")} />
          </Field>

          <Field id="video" label="Vídeo (URL)" erro={form.formState.errors.video?.message}>
            <Input id="video" placeholder="https://..." {...form.register("video")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              {editando ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
