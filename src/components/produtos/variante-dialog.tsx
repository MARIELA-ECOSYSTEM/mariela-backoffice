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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/common/field";
import { CODIGO_AUTOMATICO, formatarCodigoVariante } from "@/lib/codigos";
import { varianteSchema, type VarianteFormValues } from "@/schemas/produto.schema";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useAtualizarVariante, useCriarVariante } from "@/hooks/use-variantes";
import { mensagemDeErro } from "@/services/api/client";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import type { Variante } from "@/types/variante";

/** Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário. */
const CAMPOS_MAPEAVEIS = ["cor"] as const;

export function VarianteDialog({
  produtoId,
  codProduto,
  variante,
  open,
  onOpenChange,
}: {
  produtoId: string;
  /** Código do produto: base do código automático da variante (`PROD-0001-AZUL`). */
  codProduto: string;
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
    defaultValues: { cor: "", foto: "", video: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      cor: variante?.cor ?? "",
      foto: variante?.foto ?? "",
      video: variante?.video ?? "",
    });
  }, [open, variante, form]);

  async function onSubmit(values: VarianteFormValues) {
    const payload = {
      // O código é gerado pelo backend a partir do código do produto + cor.
      cor: values.cor,
      foto: values.foto || null,
      video: values.video || null,
    };
    try {
      if (variante) await atualizar.mutateAsync({ varianteId: variante.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(editando ? "Variante atualizada com sucesso." : "Variante criada com sucesso.");
      onOpenChange(false);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
      toast.error(mensagemDeErro(error, "Não foi possível salvar a variante."));
    }
  }

  const corAtual = form.watch("cor");
  const codigoPrevisto = corAtual ? formatarCodigoVariante(codProduto, corAtual) : "";
  const enviando = criar.isPending || atualizar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editando ? "Editar variante" : "Adicionar variante"}
          </DialogTitle>
          <DialogDescription>
            Cada variante representa uma cor do produto. Os tamanhos são adicionados em seguida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="codVariante">Código da variante</Label>
            <Input
              id="codVariante"
              readOnly
              tabIndex={-1}
              aria-describedby="codVariante-hint"
              className="bg-muted/40 font-mono text-xs"
              value={codigoPrevisto || CODIGO_AUTOMATICO}
            />
            <p id="codVariante-hint" className="text-xs text-muted-foreground">
              Gerado automaticamente pelo sistema a partir do código do produto e da cor.
            </p>
          </div>

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
