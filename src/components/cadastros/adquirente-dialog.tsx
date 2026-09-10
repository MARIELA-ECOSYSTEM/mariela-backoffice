import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import { LABEL_MODALIDADE_TARIFA, MODALIDADES_TARIFA } from "@/types/adquirente";

/**
 * Espelha as regras reais de `AdquirentesService.validarTabelaTarifas`
 * (mariela-backend): débito só aceita 1 parcela, crédito aceita 1–24, e
 * nenhuma combinação (modalidade, parcelas) pode se repetir na tabela.
 */
const tarifaSchema = z
  .object({
    modalidade: z.enum(["debito", "credito"]),
    parcelas: z.coerce
      .number({ invalid_type_error: "Informe um número." })
      .int("Use um número inteiro de parcelas.")
      .min(1, "Parcelas deve ser maior ou igual a 1.")
      .max(24, "Parcelas não pode ser maior que 24."),
    percentual: z.coerce
      .number({ invalid_type_error: "Informe um valor." })
      .min(0, "Percentual não pode ser negativo."),
  })
  .superRefine((valor, ctx) => {
    if (valor.modalidade === "debito" && valor.parcelas !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parcelas"],
        message: "Débito só pode ter 1 parcela.",
      });
    }
  });

const adquirenteSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120, "Máximo de 120 caracteres."),
    ativo: z.boolean(),
    observacao: z.string().trim().max(400, "Máximo de 400 caracteres."),
    tabelaTarifas: z.array(tarifaSchema),
  })
  .superRefine((valores, ctx) => {
    const vistos = new Map<string, number>();
    valores.tabelaTarifas.forEach((tarifa, indice) => {
      const chave = `${tarifa.modalidade}:${tarifa.parcelas}`;
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tabelaTarifas", indice, "parcelas"],
          message: `Já existe uma tarifa para ${LABEL_MODALIDADE_TARIFA[tarifa.modalidade].toLowerCase()} em ${tarifa.parcelas}x.`,
        });
      }
      vistos.set(chave, indice);
    });
  });

export type AdquirenteFormValues = z.infer<typeof adquirenteSchema>;

export const ADQUIRENTE_VALORES_PADRAO: AdquirenteFormValues = {
  nome: "",
  ativo: true,
  observacao: "",
  tabelaTarifas: [],
};

/** Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário. */
const CAMPOS_MAPEAVEIS = ["nome", "observacao", "tabelaTarifas"] as const;

export function AdquirenteDialog({
  open,
  onOpenChange,
  edicao,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edicao: boolean;
  valoresIniciais: AdquirenteFormValues;
  salvando: boolean;
  onSubmit: (valores: AdquirenteFormValues) => Promise<void>;
}) {
  const form = useForm<AdquirenteFormValues>({
    resolver: zodResolver(adquirenteSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;
  const tarifas = useFieldArray({ control: form.control, name: "tabelaTarifas" });

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  async function enviar(valores: AdquirenteFormValues) {
    try {
      await onSubmit(valores);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">
            {edicao ? "Editar adquirente" : "Nova adquirente"}
          </DialogTitle>
          <DialogDescription>
            Adquirente de cartão (ex.: Cielo, Stone, Rede) e a tabela de tarifas usada no
            recebimento de vendas no débito/crédito.
          </DialogDescription>
        </DialogHeader>

        <form
          id="adquirente-form"
          noValidate
          onSubmit={form.handleSubmit(enviar)}
          className="max-h-[65vh] space-y-5 overflow-y-auto px-1"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" placeholder="Cielo" {...form.register("nome")} />
          </Field>

          <Field id="observacao" label="Observação" erro={errors.observacao?.message}>
            <Textarea
              id="observacao"
              rows={2}
              placeholder="Opcional"
              {...form.register("observacao")}
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <Label htmlFor="ativo">Adquirente ativa</Label>
            <Switch
              id="ativo"
              checked={form.watch("ativo")}
              onCheckedChange={(valor) => form.setValue("ativo", valor)}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Label>Tabela de tarifas</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Débito aceita apenas 1 parcela; crédito aceita de 1 a 24. Não repita a mesma
                  combinação.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  tarifas.append({ modalidade: "credito", parcelas: 1, percentual: 0 })
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Adicionar tarifa
              </Button>
            </div>

            {tarifas.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-4 text-sm text-muted-foreground">
                Nenhuma tarifa configurada. A adquirente pode ser salva assim e configurada depois.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1fr_5rem_6rem_2.25rem] gap-2 px-3 font-brand text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground sm:grid">
                  <span>Modalidade</span>
                  <span>Parcelas</span>
                  <span>Taxa (%)</span>
                  <span className="sr-only">Ações</span>
                </div>
                {tarifas.fields.map((item, indice) => {
                  const modalidadeAtual = form.watch(`tabelaTarifas.${indice}.modalidade`);
                  const ehDebito = modalidadeAtual === "debito";
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_2.25rem] items-start gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_2.25rem] sm:p-2 sm:pl-3"
                    >
                      <Select
                        value={modalidadeAtual}
                        onValueChange={(valor) => {
                          form.setValue(
                            `tabelaTarifas.${indice}.modalidade`,
                            valor as "debito" | "credito",
                            {
                              shouldValidate: true,
                            },
                          );
                          if (valor === "debito") {
                            form.setValue(`tabelaTarifas.${indice}.parcelas`, 1, {
                              shouldValidate: true,
                            });
                          }
                        }}
                      >
                        <SelectTrigger aria-label="Modalidade">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODALIDADES_TARIFA.map((modalidade) => (
                            <SelectItem key={modalidade} value={modalidade}>
                              {LABEL_MODALIDADE_TARIFA[modalidade]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="w-full min-w-0">
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          disabled={ehDebito}
                          aria-label="Parcelas"
                          placeholder="Nx"
                          {...form.register(`tabelaTarifas.${indice}.parcelas`)}
                        />
                      </div>

                      <div className="w-full min-w-0">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          aria-label="Percentual"
                          placeholder="%"
                          {...form.register(`tabelaTarifas.${indice}.percentual`)}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover tarifa ${indice + 1}`}
                        onClick={() => tarifas.remove(indice)}
                        className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>

                      {errors.tabelaTarifas?.[indice]?.parcelas?.message ? (
                        <p className="col-span-4 text-xs text-destructive">
                          {errors.tabelaTarifas[indice]?.parcelas?.message}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {typeof errors.tabelaTarifas?.message === "string" ? (
              <p className="text-xs text-destructive">{errors.tabelaTarifas.message}</p>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="adquirente-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
