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
import { AcoesFormulario, CorpoFormulario, SecaoFormulario } from "@/components/common/form-layout";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import { formatarTelefone } from "@/utils/cliente";

/**
 * Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente
 * ao campo do formulário. Os campos de endereço (`cep`, `logradouro`…) ficam
 * de fora de propósito: o backend valida `EnderecoFornecedorDto` aninhado e
 * devolve `field: "endereco.cep"`, `"endereco.logradouro"` etc. — nomes que
 * não existem neste formulário achatado, então mapear seria especulativo.
 */
const CAMPOS_MAPEAVEIS = [
  "nome",
  "foto",
  "contato",
  "telefone",
  "email",
  "cnpj",
  "instagram",
  "observacao",
] as const;

/**
 * Cadastro de fornecedor.
 *
 * REGRAS:
 * - Fornecedor NÃO tem status ativo/inativo.
 * - Código é gerado pela API (somente leitura, exibido na edição).
 * - Telefone único (serve como WhatsApp) e endereço 100% opcional.
 */
const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  foto: z.string().trim().max(400),
  contato: z.string().trim().max(120),
  telefone: z.string().trim().max(20),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((valor) => !valor || /.+@.+\..+/.test(valor), {
      message: "E-mail inválido.",
    }),
  cnpj: z.string().trim().max(20),
  instagram: z.string().trim().max(60),
  observacao: z.string().trim().max(500),
  cep: z.string().trim().max(12),
  logradouro: z.string().trim().max(160),
  numero: z.string().trim().max(20),
  complemento: z.string().trim().max(80),
  bairro: z.string().trim().max(80),
  cidade: z.string().trim().max(80),
  estado: z.string().trim().max(2),
});

export type FornecedorFormValues = z.infer<typeof fornecedorSchema>;

export const FORNECEDOR_VALORES_PADRAO: FornecedorFormValues = {
  nome: "",
  foto: "",
  contato: "",
  telefone: "",
  email: "",
  cnpj: "",
  instagram: "",
  observacao: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

export function FornecedorDialog({
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
  codigo?: string | undefined;
  valoresIniciais: FornecedorFormValues;
  salvando: boolean;
  onSubmit: (valores: FornecedorFormValues) => Promise<void>;
}) {
  const form = useForm<FornecedorFormValues>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  async function enviar(valores: FornecedorFormValues) {
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
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {edicao ? "Editar fornecedor" : "Novo fornecedor"}
            {codigo ? <CodigoBadge codigo={codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Dados de contato, documento e endereço. O código é gerado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <CorpoFormulario id="fornecedor-form" onSubmit={form.handleSubmit(enviar)}>
          <SecaoFormulario titulo="Dados principais">
            <Field id="nome" label="Nome" obrigatorio erro={errors.nome?.message}>
              <Input id="nome" {...form.register("nome")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="cnpj" label="CNPJ" erro={errors.cnpj?.message}>
                <Input id="cnpj" placeholder="00.000.000/0000-00" {...form.register("cnpj")} />
              </Field>
              <Field id="foto" label="Logo/Foto (URL)" erro={errors.foto?.message}>
                <Input id="foto" placeholder="https://…" {...form.register("foto")} />
              </Field>
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Contato">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="contato" label="Pessoa de contato" erro={errors.contato?.message}>
                <Input id="contato" {...form.register("contato")} />
              </Field>
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
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="email" label="E-mail" erro={errors.email?.message}>
                <Input id="email" type="email" {...form.register("email")} />
              </Field>
              <Field id="instagram" label="Instagram" erro={errors.instagram?.message}>
                <Input id="instagram" placeholder="@perfil" {...form.register("instagram")} />
              </Field>
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Endereço (opcional)">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="cep" label="CEP" erro={errors.cep?.message}>
                <Input id="cep" placeholder="00000-000" {...form.register("cep")} />
              </Field>
              <Field
                id="logradouro"
                label="Logradouro"
                className="sm:col-span-2"
                erro={errors.logradouro?.message}
              >
                <Input id="logradouro" {...form.register("logradouro")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="numero" label="Número" erro={errors.numero?.message}>
                <Input id="numero" {...form.register("numero")} />
              </Field>
              <Field id="complemento" label="Complemento" erro={errors.complemento?.message}>
                <Input id="complemento" {...form.register("complemento")} />
              </Field>
              <Field id="bairro" label="Bairro" erro={errors.bairro?.message}>
                <Input id="bairro" {...form.register("bairro")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="cidade"
                label="Cidade"
                className="sm:col-span-2"
                erro={errors.cidade?.message}
              >
                <Input id="cidade" {...form.register("cidade")} />
              </Field>
              <Field id="estado" label="UF" erro={errors.estado?.message}>
                <Input id="estado" maxLength={2} placeholder="SP" {...form.register("estado")} />
              </Field>
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Observações">
            <Field id="observacao" label="Observação" erro={errors.observacao?.message}>
              <Textarea id="observacao" rows={3} {...form.register("observacao")} />
            </Field>
          </SecaoFormulario>
        </CorpoFormulario>
        <DialogFooter>
          <AcoesFormulario
            formId="fornecedor-form"
            salvando={salvando}
            onCancelar={() => onOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
