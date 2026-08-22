import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { produtoSchema, type ProdutoFormValues } from "@/schemas/produto.schema";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { calcularMargem } from "@/utils/produto";
import { formatarPercentual } from "@/utils/format";
import type { Produto } from "@/types/produto";

const SEM_VINCULO = "__nenhum__";

export function ProdutoForm({
  produto,
  onSubmit,
  enviando,
  onCancel,
}: {
  produto?: Produto;
  onSubmit: (values: ProdutoFormValues) => void | Promise<void>;
  enviando: boolean;
  onCancel: () => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();
  const { data: fornecedores } = useFornecedores();

  const form = useForm<ProdutoFormValues>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      codProduto: produto?.codProduto ?? "",
      nome: produto?.nome ?? "",
      descricao: produto?.descricao ?? "",
      categoria: produto?.categoria ?? "",
      colecaoId: produto?.colecaoId ?? SEM_VINCULO,
      campanhaId: produto?.campanhaId ?? SEM_VINCULO,
      fornecedorId: produto?.fornecedorId ?? SEM_VINCULO,
      precoCusto: produto?.precoCusto ?? 0,
      precoVenda: produto?.precoVenda ?? 0,
      ehNovidade: produto?.ehNovidade ?? false,
    },
  });

  const errors = form.formState.errors;
  const custo = Number(form.watch("precoCusto")) || 0;
  const venda = Number(form.watch("precoVenda")) || 0;

  function handleSubmit(values: ProdutoFormValues) {
    void onSubmit({
      ...values,
      colecaoId: values.colecaoId === SEM_VINCULO ? undefined : values.colecaoId,
      campanhaId: values.campanhaId === SEM_VINCULO ? undefined : values.campanhaId,
      fornecedorId: values.fornecedorId === SEM_VINCULO ? undefined : values.fornecedorId,
    });
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-xl">Informações gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field id="codProduto" label="Código do produto" erro={errors.codProduto?.message}>
            <Input id="codProduto" placeholder="PRD-0001" {...form.register("codProduto")} />
          </Field>

          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" placeholder="Vestido Midi Amalfi" {...form.register("nome")} />
          </Field>

          <Field id="categoria" label="Categoria" erro={errors.categoria?.message} className="md:col-span-1">
            <Select
              value={form.watch("categoria")}
              onValueChange={(valor) => form.setValue("categoria", valor, { shouldValidate: true })}
            >
              <SelectTrigger id="categoria" aria-label="Categoria">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {(configuracoes?.categorias ?? []).map((categoria) => (
                  <SelectItem key={categoria} value={categoria}>
                    {categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="fornecedorId" label="Fornecedor" erro={errors.fornecedorId?.message}>
            <Select
              value={form.watch("fornecedorId") ?? SEM_VINCULO}
              onValueChange={(valor) => form.setValue("fornecedorId", valor)}
            >
              <SelectTrigger id="fornecedorId" aria-label="Fornecedor">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VINCULO}>Sem fornecedor</SelectItem>
                {(fornecedores ?? []).map((fornecedor) => (
                  <SelectItem key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="colecaoId" label="Coleção" erro={errors.colecaoId?.message}>
            <Select
              value={form.watch("colecaoId") ?? SEM_VINCULO}
              onValueChange={(valor) => form.setValue("colecaoId", valor)}
            >
              <SelectTrigger id="colecaoId" aria-label="Coleção">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VINCULO}>Sem coleção</SelectItem>
                {(colecoes ?? []).map((colecao) => (
                  <SelectItem key={colecao.id} value={colecao.id}>
                    {colecao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="campanhaId" label="Campanha" erro={errors.campanhaId?.message}>
            <Select
              value={form.watch("campanhaId") ?? SEM_VINCULO}
              onValueChange={(valor) => form.setValue("campanhaId", valor)}
            >
              <SelectTrigger id="campanhaId" aria-label="Campanha">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VINCULO}>Sem campanha</SelectItem>
                {(campanhas ?? []).map((campanha) => (
                  <SelectItem key={campanha.id} value={campanha.id}>
                    {campanha.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="descricao"
            label="Descrição"
            erro={errors.descricao?.message}
            className="md:col-span-2"
          >
            <Textarea id="descricao" rows={3} {...form.register("descricao")} />
          </Field>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-xl">Preços</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <Field id="precoCusto" label="Preço de custo (R$)" erro={errors.precoCusto?.message}>
            <Input id="precoCusto" type="number" step="0.01" min="0" {...form.register("precoCusto")} />
          </Field>
          <Field id="precoVenda" label="Preço de venda (R$)" erro={errors.precoVenda?.message}>
            <Input id="precoVenda" type="number" step="0.01" min="0" {...form.register("precoVenda")} />
          </Field>
          <div className="space-y-2">
            <Label>Margem calculada</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
              {formatarPercentual(calcularMargem(custo, venda))}
            </div>
            <p className="text-xs text-muted-foreground">A promoção é ativada na tela do produto.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm font-medium">Marcar como novidade</p>
            <p className="text-xs text-muted-foreground">
              Produtos novos recebem destaque nas vitrines e relatórios.
            </p>
          </div>
          <Switch
            checked={form.watch("ehNovidade")}
            onCheckedChange={(valor) => form.setValue("ehNovidade", valor)}
            aria-label="Marcar como novidade"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {produto ? "Salvar alterações" : "Criar produto"}
        </Button>
      </div>
    </form>
  );
}
