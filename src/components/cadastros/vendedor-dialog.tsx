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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import {
  AcoesFormulario,
  AlternadorCampo,
  CorpoFormulario,
  SecaoFormulario,
} from "@/components/common/form-layout";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import { formatarTelefone } from "@/utils/cliente";

/**
 * Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente
 * ao campo do formulário. `confirmacaoSenha` fica de fora de propósito: não
 * existe no payload enviado à API, é validação só do cliente (zod).
 */
const CAMPOS_MAPEAVEIS = [
  "nome",
  "foto",
  "telefone",
  "dataNascimento",
  "observacao",
  "senha",
] as const;

const vendedorSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    foto: z.string().trim().max(400),
    telefone: z.string().trim().max(20),
    dataNascimento: z.string().trim(),
    observacao: z.string().trim().max(400),
    senha: z.string(),
    confirmacaoSenha: z.string(),
    ativo: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    if (valores.senha && valores.senha.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["senha"],
        message: "A senha deve ter ao menos 6 caracteres.",
      });
    }
    if (valores.senha !== valores.confirmacaoSenha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmacaoSenha"],
        message: "As senhas não conferem.",
      });
    }
  });

export type VendedorFormValues = z.infer<typeof vendedorSchema>;

export const VENDEDOR_VALORES_PADRAO: VendedorFormValues = {
  nome: "",
  foto: "",
  telefone: "",
  dataNascimento: "",
  observacao: "",
  senha: "",
  confirmacaoSenha: "",
  ativo: true,
};

export function VendedorDialog({
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
  /** Código gerado pela API (`VEN-0001`), somente leitura. */
  codigo?: string | undefined;
  valoresIniciais: VendedorFormValues;
  salvando: boolean;
  onSubmit: (valores: VendedorFormValues) => Promise<void>;
}) {
  const form = useForm<VendedorFormValues>({
    resolver: zodResolver(vendedorSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  async function submeter(valores: VendedorFormValues) {
    if (!edicao && !valores.senha) {
      form.setError("senha", { message: "Senha é obrigatória para novos vendedores." });
      return;
    }
    try {
      await onSubmit(valores);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {edicao ? "Editar vendedor(a)" : "Novo vendedor(a)"}
            {codigo ? <CodigoBadge codigo={codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Usuário do MARIELA PDV. A senha é enviada à API, que gera o hash — o backoffice nunca
            exibe senhas.
          </DialogDescription>
        </DialogHeader>
        <CorpoFormulario id="vendedor-form" onSubmit={form.handleSubmit(submeter)}>
          <SecaoFormulario titulo="Dados pessoais">
            <Field id="nome" label="Nome" obrigatorio erro={errors.nome?.message}>
              <Input id="nome" autoComplete="name" {...form.register("nome")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="telefone"
                label="Telefone / WhatsApp"
                erro={errors.telefone?.message}
                hint="Mesmo número usado para mensagens."
              >
                <Input
                  id="telefone"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  value={form.watch("telefone")}
                  onChange={(evento) =>
                    form.setValue("telefone", formatarTelefone(evento.target.value), {
                      shouldDirty: true,
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
            <Field id="foto" label="Foto (URL)" erro={errors.foto?.message}>
              <Input id="foto" placeholder="https://…" {...form.register("foto")} />
            </Field>
          </SecaoFormulario>

          <SecaoFormulario
            titulo="Acesso ao PDV"
            descricao={
              edicao
                ? "Deixe em branco para manter a senha atual."
                : "Defina a senha inicial de acesso — ao menos 6 caracteres."
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="senha"
                label={edicao ? "Nova senha (opcional)" : "Senha"}
                obrigatorio={!edicao}
                erro={errors.senha?.message}
              >
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("senha")}
                />
              </Field>
              <Field
                id="confirmacaoSenha"
                label="Confirmar senha"
                erro={errors.confirmacaoSenha?.message}
              >
                <Input
                  id="confirmacaoSenha"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmacaoSenha")}
                />
              </Field>
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Situação">
            <AlternadorCampo
              id="ativo"
              titulo="Vendedor(a) ativo(a)"
              descricao="Vendedores inativos não podem registrar vendas no PDV."
              checked={form.watch("ativo")}
              onChange={(valor) => form.setValue("ativo", valor)}
            />
            <Field id="observacao" label="Observação" erro={errors.observacao?.message}>
              <Textarea id="observacao" rows={3} {...form.register("observacao")} />
            </Field>
          </SecaoFormulario>
        </CorpoFormulario>
        <DialogFooter>
          <AcoesFormulario
            formId="vendedor-form"
            salvando={salvando}
            onCancelar={() => onOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
