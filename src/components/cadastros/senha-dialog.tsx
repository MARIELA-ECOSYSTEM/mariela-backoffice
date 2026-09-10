import { useEffect } from "react";
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
import { Field } from "@/components/common/field";
import { AcoesFormulario, CorpoFormulario } from "@/components/common/form-layout";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";

/** Campo cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário. */
const CAMPOS_MAPEAVEIS = ["senha"] as const;

const senhaSchema = z
  .object({
    senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmacaoSenha: z.string(),
  })
  .refine((valores) => valores.senha === valores.confirmacaoSenha, {
    path: ["confirmacaoSenha"],
    message: "As senhas não conferem.",
  });

export type SenhaFormValues = z.infer<typeof senhaSchema>;

/** Redefinição de senha de vendedor: a senha nunca é exibida nem persistida na UI. */
export function SenhaDialog({
  open,
  onOpenChange,
  nome,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  salvando: boolean;
  onSubmit: (valores: SenhaFormValues) => Promise<void>;
}) {
  const form = useForm<SenhaFormValues>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { senha: "", confirmacaoSenha: "" },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ senha: "", confirmacaoSenha: "" });
  }, [open, form]);

  async function enviar(valores: SenhaFormValues) {
    try {
      await onSubmit(valores);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha de acesso ao PDV para {nome}. O hash é gerado pela API.
          </DialogDescription>
        </DialogHeader>
        <CorpoFormulario id="senha-form" onSubmit={form.handleSubmit(enviar)}>
          <Field
            id="nova-senha"
            label="Nova senha"
            obrigatorio
            hint="Ao menos 6 caracteres."
            erro={errors.senha?.message}
          >
            <Input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              {...form.register("senha")}
            />
          </Field>
          <Field
            id="nova-senha-confirmacao"
            label="Confirmar senha"
            erro={errors.confirmacaoSenha?.message}
          >
            <Input
              id="nova-senha-confirmacao"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmacaoSenha")}
            />
          </Field>
        </CorpoFormulario>
        <DialogFooter>
          <AcoesFormulario
            formId="senha-form"
            salvando={salvando}
            onCancelar={() => onOpenChange(false)}
            rotuloSalvar="Salvar senha"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
