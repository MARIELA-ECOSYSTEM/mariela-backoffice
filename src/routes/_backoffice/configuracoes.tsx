import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CreditCard, Loader2, Palette, Ruler, Store, Tags } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/common/field";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { ListaConfiguravel } from "@/components/configuracoes/lista-configuravel";
import { useAtualizarLoja, useConfiguracoes } from "@/hooks/use-configuracoes";
import { mensagemDeErro } from "@/services/api/client";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import { formatarData } from "@/utils/format";

export const Route = createFileRoute("/_backoffice/configuracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurações — MARIELA Backoffice" },
      {
        name: "description",
        content: "Dados da loja, categorias, tamanhos, cores e formas de pagamento.",
      },
      { property: "og:title", content: "Configurações — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Dados da loja, categorias, tamanhos, cores e formas de pagamento.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

const lojaSchema = z.object({
  nome: z.string().trim().min(1, "Nome da loja é obrigatório.").max(120),
  logo: z.string().trim().max(500),
  telefone: z.string().trim().max(20),
  whatsapp: z.string().trim().max(20),
  email: z
    .string()
    .trim()
    .min(1, "E-mail é obrigatório.")
    .email("Informe um e-mail válido.")
    .max(255),
  endereco: z.object({
    cep: z.string().trim().max(12),
    logradouro: z.string().trim().max(150),
    numero: z.string().trim().max(20),
    complemento: z.string().trim().max(80),
    bairro: z.string().trim().max(80),
    cidade: z.string().trim().max(80),
    estado: z.string().trim().max(2),
  }),
});

type LojaFormValues = z.infer<typeof lojaSchema>;

/** Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário (inclusive os aninhados de endereço). */
const CAMPOS_MAPEAVEIS = [
  "nome",
  "logo",
  "telefone",
  "whatsapp",
  "email",
  "endereco.cep",
  "endereco.logradouro",
  "endereco.numero",
  "endereco.complemento",
  "endereco.bairro",
  "endereco.cidade",
  "endereco.estado",
] as const;

function ConfiguracoesPage() {
  const { data: configuracoes, isPending, isError, error, refetch } = useConfiguracoes();
  const atualizar = useAtualizarLoja();

  const form = useForm<LojaFormValues>({
    resolver: zodResolver(lojaSchema),
    defaultValues: {
      nome: "",
      logo: "",
      telefone: "",
      whatsapp: "",
      email: "",
      endereco: {
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
      },
    },
  });

  useEffect(() => {
    if (configuracoes) form.reset(configuracoes.loja);
  }, [configuracoes, form]);

  async function onSubmit(values: LojaFormValues) {
    try {
      await atualizar.mutateAsync(values);
      toast.success("Dados da loja atualizados com sucesso.");
    } catch (err) {
      aplicarErrosDeCampo(err, form, CAMPOS_MAPEAVEIS);
      toast.error(mensagemDeErro(err, "Não foi possível atualizar os dados da loja."));
    }
  }

  const errors = form.formState.errors;

  const secoes = [
    { valor: "loja", label: "Dados da loja", icone: Store },
    { valor: "categorias", label: "Categorias", icone: Tags },
    { valor: "tamanhos", label: "Tamanhos", icone: Ruler },
    { valor: "cores", label: "Cores", icone: Palette },
    { valor: "pagamento", label: "Formas de pagamento", icone: CreditCard },
  ] as const;

  return (
    <Page
      titulo="Configurações"
      breadcrumbs={[{ label: "Sistema" }, { label: "Configurações" }]}
      descricao={
        configuracoes
          ? `Última atualização em ${formatarData(configuracoes.atualizadoEm)}.`
          : "Dados da loja e listas administráveis do catálogo."
      }
    >
      {isPending ? (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 rounded-lg" />
            ))}
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      ) : isError || !configuracoes ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Tabs
          defaultValue="loja"
          orientation="vertical"
          className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"
        >
          <TabsList className="h-auto w-full flex-row overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-card lg:flex-col lg:overflow-visible">
            {secoes.map((secao) => (
              <TabsTrigger
                key={secao.valor}
                value={secao.valor}
                className="w-full justify-start gap-2 rounded-lg px-3 py-2 text-left data-[state=active]:bg-primary-soft data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                <secao.icone aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{secao.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="loja" className="mt-0">
            <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-4xl space-y-6" noValidate>
              <Card className="border-border shadow-card">
                <CardHeader className="gap-1.5 border-b border-border/70 pb-4">
                  <CardTitle className="font-display text-xl leading-none">Identificação</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Nome, marca e canais de contato exibidos nos documentos da loja.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5 md:grid-cols-2">
                  <Field id="nome" label="Nome da loja" erro={errors.nome?.message}>
                    <Input id="nome" {...form.register("nome")} />
                  </Field>
                  <Field id="logo" label="Logo (URL)" erro={errors.logo?.message}>
                    <Input id="logo" placeholder="https://…" {...form.register("logo")} />
                  </Field>
                  <Field id="email" label="E-mail" erro={errors.email?.message}>
                    <Input id="email" type="email" {...form.register("email")} />
                  </Field>
                  <Field id="telefone" label="Telefone" erro={errors.telefone?.message}>
                    <Input id="telefone" {...form.register("telefone")} />
                  </Field>
                  <Field id="whatsapp" label="WhatsApp" erro={errors.whatsapp?.message}>
                    <Input id="whatsapp" {...form.register("whatsapp")} />
                  </Field>
                </CardContent>
              </Card>

              <Card className="border-border shadow-card">
                <CardHeader className="gap-1.5 border-b border-border/70 pb-4">
                  <CardTitle className="font-display text-xl leading-none">Endereço</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Endereço físico da loja usado em documentos e contatos.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5 md:grid-cols-3">
                  <Field id="cep" label="CEP" erro={errors.endereco?.cep?.message}>
                    <Input id="cep" {...form.register("endereco.cep")} />
                  </Field>
                  <Field
                    id="logradouro"
                    label="Logradouro"
                    erro={errors.endereco?.logradouro?.message}
                    className="md:col-span-2"
                  >
                    <Input id="logradouro" {...form.register("endereco.logradouro")} />
                  </Field>
                  <Field id="numero" label="Número" erro={errors.endereco?.numero?.message}>
                    <Input id="numero" {...form.register("endereco.numero")} />
                  </Field>
                  <Field
                    id="complemento"
                    label="Complemento"
                    erro={errors.endereco?.complemento?.message}
                  >
                    <Input id="complemento" {...form.register("endereco.complemento")} />
                  </Field>
                  <Field id="bairro" label="Bairro" erro={errors.endereco?.bairro?.message}>
                    <Input id="bairro" {...form.register("endereco.bairro")} />
                  </Field>
                  <Field id="cidade" label="Cidade" erro={errors.endereco?.cidade?.message}>
                    <Input id="cidade" {...form.register("endereco.cidade")} />
                  </Field>
                  <Field id="estado" label="Estado (UF)" erro={errors.endereco?.estado?.message}>
                    <Input id="estado" maxLength={2} {...form.register("endereco.estado")} />
                  </Field>
                </CardContent>
              </Card>

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-card backdrop-blur">
                <p className="text-xs text-muted-foreground">
                  As alterações passam a valer imediatamente após salvar.
                </p>
                <Button type="submit" disabled={atualizar.isPending}>
                  {atualizar.isPending ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : null}
                  Salvar dados da loja
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="categorias" className="mt-5 max-w-3xl">
            <ListaConfiguravel
              lista="categorias"
              titulo="Categorias"
              descricao="Categorias disponíveis no cadastro de produtos."
              itens={configuracoes.categorias}
              placeholder="Ex.: Vestidos"
            />
          </TabsContent>

          <TabsContent value="tamanhos" className="mt-5 max-w-3xl">
            <ListaConfiguravel
              lista="tamanhos"
              titulo="Tamanhos"
              descricao="Tamanhos disponíveis nas variantes. Use U para tamanho único."
              itens={configuracoes.tamanhos}
              placeholder="Ex.: PP"
            />
          </TabsContent>

          <TabsContent value="cores" className="mt-5 max-w-3xl">
            <ListaConfiguravel
              lista="cores"
              titulo="Cores"
              descricao="Cores usadas na criação de variantes."
              itens={configuracoes.cores}
              placeholder="Ex.: Vinho"
            />
          </TabsContent>

          <TabsContent value="pagamento" className="mt-5 max-w-3xl">
            <ListaConfiguravel
              lista="formasPagamento"
              titulo="Formas de pagamento"
              descricao="Formas de pagamento aceitas pela loja."
              itens={configuracoes.formasPagamento}
              placeholder="Ex.: Pix"
            />
          </TabsContent>
        </Tabs>
      )}
    </Page>
  );
}
