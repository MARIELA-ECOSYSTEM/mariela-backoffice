import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { AcoesFormulario, CorpoFormulario, SecaoFormulario } from "@/components/common/form-layout";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import { formatarTelefone, telefoneValido } from "@/utils/cliente";

/** Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário. */
const CAMPOS_MAPEAVEIS = ["nome", "foto", "telefone", "dataNascimento", "observacao"] as const;

const clienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  foto: z.string().trim().max(400),
  telefone: z
    .string()
    .trim()
    .min(1, "Telefone é obrigatório.")
    .max(20)
    .refine(telefoneValido, "Informe DDD + número, ex.: (83) 99999-9999."),
  dataNascimento: z.string().trim(),
  observacao: z.string().trim().max(400),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

export const CLIENTE_VALORES_PADRAO: ClienteFormValues = {
  nome: "",
  foto: "",
  telefone: "",
  dataNascimento: "",
  observacao: "",
};

export function ClienteDialog({
  open,
  onOpenChange,
  edicao,
  codigo,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edicao: boolean;
  /** Código gerado pela API — somente leitura. */
  codigo?: string | undefined;
  valoresIniciais: ClienteFormValues;
  salvando: boolean;
  onSubmit: (valores: ClienteFormValues) => Promise<void>;
}) {
  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;
  // Guarda síncrona via ref: `salvando` (mutation.isPending do chamador) só
  // reflete a submissão em andamento após o próximo render, o que não é
  // rápido o suficiente para barrar um duplo clique real no botão de submit
  // (o segundo evento de submit do <form> pode disparar antes do botão ser
  // desabilitado) — comprovado na Etapa 20.16.
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  async function enviar(valores: ClienteFormValues) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    try {
      await onSubmit(valores);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
    } finally {
      enviandoRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {edicao ? "Editar cliente" : "Nova cliente"}
            {edicao && codigo ? <CodigoBadge codigo={codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Nome, telefone (usado também no WhatsApp), data de nascimento e observações. O código é
            gerado automaticamente pelo sistema.
          </DialogDescription>
        </DialogHeader>
        <CorpoFormulario id="cliente-form" onSubmit={form.handleSubmit(enviar)}>
          <SecaoFormulario titulo="Dados pessoais">
            <Field id="nome" label="Nome" obrigatorio erro={errors.nome?.message}>
              <Input id="nome" autoComplete="name" {...form.register("nome")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="telefone"
                label="Telefone (WhatsApp)"
                obrigatorio
                hint="DDD + número."
                erro={errors.telefone?.message}
              >
                <Input
                  id="telefone"
                  inputMode="tel"
                  placeholder="(83) 99999-9999"
                  {...form.register("telefone")}
                  onChange={(evento) =>
                    form.setValue("telefone", formatarTelefone(evento.target.value), {
                      shouldValidate: form.formState.isSubmitted,
                    })
                  }
                />
              </Field>
              <Field
                id="dataNascimento"
                label="Data de nascimento"
                erro={errors.dataNascimento?.message}
              >
                <Input id="dataNascimento" type="date" {...form.register("dataNascimento")} />
              </Field>
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Complementos">
            <Field id="foto" label="Foto (URL)" erro={errors.foto?.message}>
              <Input id="foto" placeholder="https://…" {...form.register("foto")} />
            </Field>
            <Field id="observacao" label="Observação" erro={errors.observacao?.message}>
              <Textarea id="observacao" rows={3} {...form.register("observacao")} />
            </Field>
          </SecaoFormulario>
        </CorpoFormulario>
        <DialogFooter>
          <AcoesFormulario
            formId="cliente-form"
            salvando={salvando}
            onCancelar={() => onOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
