import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { CODIGO_AUTOMATICO } from "@/lib/codigos";
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

  // Modo de preenchimento: custo + margem (calcula venda) ou custo + venda (calcula margem).
  const [porMargem, setPorMargem] = useState(false);
  const [margemInformada, setMargemInformada] = useState(() =>
    String(calcularMargem(produto?.precoCusto ?? 0, produto?.precoVenda ?? 0)),
  );
  const margemCalculada = calcularMargem(custo, venda);

  /** Inverso da regra oficial de margem: venda = custo * (1 + margem/100). */
  function vendaPelaMargem(precoCusto: number, margem: number): number {
    return Number((precoCusto * (1 + margem / 100)).toFixed(2));
  }

  function aplicarMargem(valor: string) {
    setMargemInformada(valor);
    const margem = Number(valor);
    if (!Number.isFinite(margem) || custo <= 0) return;
    form.setValue("precoVenda", vendaPelaMargem(custo, margem), { shouldValidate: true });
  }

  function aplicarCusto(valor: string) {
    const novoCusto = Number(valor) || 0;
    if (!porMargem) return;
    const margem = Number(margemInformada);
    if (!Number.isFinite(margem) || novoCusto <= 0) return;
    form.setValue("precoVenda", vendaPelaMargem(novoCusto, margem), { shouldValidate: true });
  }

  function alternarModo(ativo: boolean) {
    setPorMargem(ativo);
    // Preserva os valores digitados e recalcula apenas o campo derivado.
    if (ativo) {
      const margem = margemCalculada;
      setMargemInformada(String(margem));
      if (custo > 0) form.setValue("precoVenda", vendaPelaMargem(custo, margem));
    } else {
      setMargemInformada(String(margemCalculada));
    }
  }

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
          <div className="space-y-2">
            <Label>Código do produto</Label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
              {produto ? (
                <CodigoBadge codigo={produto.codProduto} />
              ) : (
                <span className="text-muted-foreground">{CODIGO_AUTOMATICO}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Gerado automaticamente pelo sistema e não editável.
            </p>
          </div>

          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" placeholder="Vestido Midi Amalfi" {...form.register("nome")} />
          </Field>

          <Field
            id="categoria"
            label="Categoria"
            erro={errors.categoria?.message}
            className="md:col-span-1"
          >
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
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
            <Switch
              id="porMargem"
              checked={porMargem}
              onCheckedChange={alternarModo}
              aria-label="Calcular preço de venda pela margem"
            />
            <Label htmlFor="porMargem" className="cursor-pointer text-sm font-medium">
              Calcular preço de venda pela margem
            </Label>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <Field id="precoCusto" label="Preço de custo (R$)" erro={errors.precoCusto?.message}>
              <Input
                id="precoCusto"
                type="number"
                step="0.01"
                min="0"
                {...form.register("precoCusto", {
                  onChange: (event) => aplicarCusto(event.target.value),
                })}
              />
            </Field>

            {porMargem ? (
              <div key="modo-margem" className="contents">
                <Field id="margemLucro" label="Margem de lucro (%)">
                  <Input
                    id="margemLucro"
                    type="number"
                    step="0.01"
                    min="0"
                    value={margemInformada}
                    onChange={(event) => aplicarMargem(event.target.value)}
                  />
                </Field>
                <div className="space-y-2">
                  <Label htmlFor="precoVendaCalculado">Preço de venda (R$)</Label>
                  <Input
                    id="precoVendaCalculado"
                    readOnly
                    tabIndex={-1}
                    className="bg-muted/40 tabular-nums"
                    value={venda ? venda.toFixed(2) : ""}
                  />
                  <p className="text-xs text-muted-foreground">Calculado automaticamente.</p>
                  {errors.precoVenda?.message ? (
                    <p className="text-xs text-destructive">{errors.precoVenda.message}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div key="modo-venda" className="contents">
                <Field
                  id="precoVenda"
                  label="Preço de venda (R$)"
                  erro={errors.precoVenda?.message}
                >
                  <Input
                    id="precoVenda"
                    type="number"
                    step="0.01"
                    min="0"
                    {...form.register("precoVenda")}
                  />
                </Field>
                <div className="space-y-2">
                  <Label>Margem de lucro (%)</Label>
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums">
                    {formatarPercentual(margemCalculada)}
                  </div>
                  <p className="text-xs text-muted-foreground">Calculada automaticamente.</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A promoção é ativada na tela do produto e não altera estes valores.
          </p>
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
