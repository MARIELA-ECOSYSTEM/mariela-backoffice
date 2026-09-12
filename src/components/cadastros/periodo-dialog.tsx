import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Image as ImageIcon, LayoutPanelTop, Sparkles } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { CODIGO_AUTOMATICO } from "@/lib/codigos";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";

/**
 * Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente
 * ao campo do formulário — mesmo contrato para Coleções e Campanhas
 * (`CriarColecaoDto`/`CriarCampanhaDto` são estruturalmente idênticos).
 */
const CAMPOS_MAPEAVEIS = [
  "nome",
  "descricao",
  "inicio",
  "fim",
  "ativo",
  "destaque",
  "banner",
  "fotoDestaque",
  "fotoBanner",
] as const;

const periodoSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    descricao: z.string().trim().max(400),
    inicio: z.string().trim().min(1, "Informe a data de início."),
    fim: z.string().trim().min(1, "Informe a data de fim."),
    ativo: z.boolean(),
    destaque: z.boolean(),
    banner: z.boolean(),
    /** URLs das imagens usadas pela futura vitrine — nunca obrigatórias. */
    fotoDestaque: z.string().trim().max(600),
    fotoBanner: z.string().trim().max(600),
  })
  .refine((valores) => valores.fim >= valores.inicio, {
    path: ["fim"],
    message: "A data de fim deve ser posterior ao início.",
  });

export type PeriodoFormValues = z.infer<typeof periodoSchema>;

export const PERIODO_VALORES_PADRAO: PeriodoFormValues = {
  nome: "",
  descricao: "",
  inicio: new Date().toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  ativo: true,
  destaque: false,
  banner: false,
  fotoDestaque: "",
  fotoBanner: "",
};

function PreviewImagem({
  url,
  proporcao,
  vazio,
}: {
  url: string;
  proporcao: "editorial" | "banner";
  vazio: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-primary-soft/40",
        proporcao === "banner" ? "aspect-[16/6]" : "aspect-[4/5] max-w-40",
      )}
    >
      {url ? (
        <img src={url} alt="Pré-visualização" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center text-primary/50">
          <ImageIcon aria-hidden className="size-5" />
          <span className="text-[0.65rem] leading-tight">{vazio}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Formulário compartilhado por Coleções e Campanhas: identificação, período,
 * status e conteúdo de vitrine (destaque/banner + imagens).
 */
export function PeriodoDialog({
  open,
  onOpenChange,
  titulo,
  descricaoDialog,
  codigo,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricaoDialog: string;
  /** Código somente leitura — gerado pela API na criação. */
  codigo?: string | null;
  valoresIniciais: PeriodoFormValues;
  salvando: boolean;
  onSubmit: (valores: PeriodoFormValues) => Promise<void>;
}) {
  const form = useForm<PeriodoFormValues>({
    resolver: zodResolver(periodoSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;
  const destaque = form.watch("destaque");
  const banner = form.watch("banner");
  // Guarda síncrona via ref: `salvando` só reflete a submissão em andamento
  // após o próximo render, tarde demais para barrar um duplo clique real no
  // submit — comprovado na Etapa 20.17 (2 POSTs reais aceitos, 2 registros
  // criados). Este componente é compartilhado por Coleções e Campanhas: a
  // correção cobre ambos.
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  async function enviar(valores: PeriodoFormValues) {
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricaoDialog}</DialogDescription>
        </DialogHeader>
        <CorpoFormulario id="periodo-form" onSubmit={form.handleSubmit(enviar)}>
          <SecaoFormulario titulo="Identificação">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr]">
              <Field id="codigo" label="Código">
                <Input id="codigo" value={codigo ?? CODIGO_AUTOMATICO} readOnly disabled />
              </Field>
              <Field id="nome" label="Nome" obrigatorio erro={errors.nome?.message}>
                <Input id="nome" {...form.register("nome")} />
              </Field>
            </div>
            <Field id="descricao" label="Descrição" erro={errors.descricao?.message}>
              <Textarea id="descricao" rows={3} {...form.register("descricao")} />
            </Field>
          </SecaoFormulario>

          <SecaoFormulario titulo="Período e situação">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="inicio" label="Início" erro={errors.inicio?.message}>
                <Input id="inicio" type="date" {...form.register("inicio")} />
              </Field>
              <Field id="fim" label="Fim" erro={errors.fim?.message}>
                <Input id="fim" type="date" {...form.register("fim")} />
              </Field>
            </div>
            <AlternadorCampo
              id="ativo"
              titulo="Ativo"
              descricao="Itens inativos não aparecem nas vitrines da loja."
              checked={form.watch("ativo")}
              onChange={(valor) => form.setValue("ativo", valor)}
            />
          </SecaoFormulario>

          <SecaoFormulario
            titulo="Conteúdo de vitrine"
            descricao="Escolha onde este item aparece e as imagens correspondentes."
            destaque
          >
            <AlternadorCampo
              id="destaque"
              titulo="Colocar em destaque"
              descricao="Aparece nos cards e nas áreas de destaque da loja."
              icone={<Sparkles aria-hidden className="size-4 text-primary" />}
              checked={destaque}
              onChange={(valor) => form.setValue("destaque", valor)}
            />
            {destaque ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <Field
                  id="fotoDestaque"
                  label="Foto de destaque (URL)"
                  hint="Formato editorial (retrato). Opcional."
                  erro={errors.fotoDestaque?.message}
                >
                  <Input
                    id="fotoDestaque"
                    placeholder="https://…"
                    {...form.register("fotoDestaque")}
                  />
                </Field>
                <PreviewImagem
                  url={form.watch("fotoDestaque")}
                  proporcao="editorial"
                  vazio="Preview do destaque"
                />
              </div>
            ) : null}

            <AlternadorCampo
              id="banner"
              titulo="Colocar no banner"
              descricao="Aparece em banners/hero sections horizontais."
              icone={<LayoutPanelTop aria-hidden className="size-4 text-primary" />}
              checked={banner}
              onChange={(valor) => form.setValue("banner", valor)}
            />
            {banner ? (
              <div className="space-y-3">
                <Field
                  id="fotoBanner"
                  label="Foto de banner (URL)"
                  hint="Proporção horizontal (16:9 ou mais larga). Opcional."
                  erro={errors.fotoBanner?.message}
                >
                  <Input id="fotoBanner" placeholder="https://…" {...form.register("fotoBanner")} />
                </Field>
                <PreviewImagem
                  url={form.watch("fotoBanner")}
                  proporcao="banner"
                  vazio="Preview do banner"
                />
              </div>
            ) : null}
          </SecaoFormulario>
        </CorpoFormulario>
        <DialogFooter>
          <AcoesFormulario
            formId="periodo-form"
            salvando={salvando}
            onCancelar={() => onOpenChange(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
