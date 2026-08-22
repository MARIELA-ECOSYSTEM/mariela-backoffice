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
import { Field } from "@/components/common/field";
import { promocaoSchema, type PromocaoFormValues } from "@/schemas/produto.schema";
import { useDefinirPromocao } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { ApiError } from "@/types/api";
import { formatarMoeda } from "@/utils/format";
import type { Produto } from "@/types/produto";

export function PromocaoDialog({
  produto,
  open,
  onOpenChange,
}: {
  produto: Produto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const definir = useDefinirPromocao(produto.id);

  const form = useForm<PromocaoFormValues>({
    resolver: zodResolver(promocaoSchema),
    defaultValues: { precoPromocional: produto.precoPromocional ?? 0 },
  });

  useEffect(() => {
    if (open) form.reset({ precoPromocional: produto.precoPromocional ?? 0 });
  }, [open, produto.precoPromocional, form]);

  async function onSubmit(values: PromocaoFormValues) {
    try {
      await definir.mutateAsync({ ehPromocao: true, precoPromocional: values.precoPromocional });
      toast.success("Promoção ativada com sucesso.");
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        error.errors.forEach((campo) => {
          if (campo.field === "precoPromocional")
            form.setError("precoPromocional", { message: campo.message });
        });
      }
      toast.error(mensagemDeErro(error, "Não foi possível ativar a promoção."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Ativar promoção</DialogTitle>
          <DialogDescription>
            Preço normal: {formatarMoeda(produto.precoVenda)}. O preço promocional passa a ser o
            preço vigente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            id="precoPromocional"
            label="Preço promocional (R$)"
            erro={form.formState.errors.precoPromocional?.message}
          >
            <Input
              id="precoPromocional"
              type="number"
              step="0.01"
              min="0"
              {...form.register("precoPromocional")}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={definir.isPending}>
              {definir.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Ativar promoção
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
