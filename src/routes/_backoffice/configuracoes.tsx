import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/common/field";
import { ErrorState, TableSkeleton } from "@/components/common/states";
import { ListaConfiguravel } from "@/components/configuracoes/lista-configuravel";
import { useAtualizarLoja, useConfiguracoes } from "@/hooks/use-configuracoes";
import { mensagemDeErro } from "@/services/api/client";
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
      toast.error(mensagemDeErro(err, "Não foi possível atualizar os dados da loja."));
    }
  }

  const errors = form.formState.errors;

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
        <TableSkeleton linhas={6} colunas={3} />
      ) : isError || !configuracoes ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Tabs defaultValue="loja">
          <TabsList>
            <TabsTrigger value="loja">Dados da loja</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="tamanhos">Tamanhos</TabsTrigger>
            <TabsTrigger value="cores">Cores</TabsTrigger>
            <TabsTrigger value="pagamento">Formas de pagamento</TabsTrigger>
          </TabsList>

          <TabsContent value="loja" className="mt-5">
            <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-4xl space-y-6" noValidate>
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Identificação</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
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

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Endereço</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-3">
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

              <div className="flex justify-end">
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
