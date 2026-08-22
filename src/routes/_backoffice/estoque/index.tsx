import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Settings2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge } from "@/components/common/status-badge";
import { useEstoque } from "@/hooks/use-estoque";
import { formatarData } from "@/utils/format";
import type { FiltroDisponibilidade } from "@/types/produto";

export const Route = createFileRoute("/_backoffice/estoque/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estoque — MARIELA Backoffice" },
      { name: "description", content: "Controle de estoque por produto, variante e tamanho." },
      { property: "og:title", content: "Estoque — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Controle de estoque por produto, variante e tamanho.",
      },
    ],
  }),
  component: EstoquePage,
});

function EstoquePage() {
  const [busca, setBusca] = useState("");
  const [disponibilidade, setDisponibilidade] = useState<FiltroDisponibilidade>("todos");
  const { data, isPending, isError, error, refetch } = useEstoque({
    busca: busca || undefined,
    disponibilidade,
  });
  const itens = data ?? [];
  const temFiltros = Boolean(busca) || disponibilidade !== "todos";

  function limpar() {
    setBusca("");
    setDisponibilidade("todos");
  }

  return (
    <Page
      titulo="Estoque"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Estoque" }]}
      descricao="O estoque pertence ao produto: total, variantes por cor e quantidade por tamanho. As alterações são feitas por entrada e saída."
    >
      <Card className="mb-5 shadow-card">
        <CardContent className="flex flex-wrap gap-3 py-5">
          <div className="relative min-w-64 flex-1">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Buscar produto no estoque"
              placeholder="Buscar por nome ou código…"
              className="pl-9"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
          <Select
            value={disponibilidade}
            onValueChange={(valor) => setDisponibilidade(valor as FiltroDisponibilidade)}
          >
            <SelectTrigger className="w-56" aria-label="Filtrar por disponibilidade">
              <SelectValue placeholder="Disponibilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Disponibilidade: todas</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="sem-estoque">Sem estoque</SelectItem>
            </SelectContent>
          </Select>
          {temFiltros ? (
            <Button variant="ghost" onClick={limpar}>
              Limpar filtros
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isPending ? (
        <TableSkeleton linhas={8} colunas={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : itens.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto encontrado"
          descricao="Não encontramos produtos para os filtros selecionados."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limpar}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Variantes</TableHead>
                <TableHead>Quantidade total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zerado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => (
                <TableRow key={item.produtoId}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.codProduto}
                  </TableCell>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell className="text-sm">{item.categoria}</TableCell>
                  <TableCell className="tabular-nums">{item.totalVariantes}</TableCell>
                  <TableCell className="tabular-nums">{item.quantidadeTotal}</TableCell>
                  <TableCell>
                    <StatusEstoqueBadge quantidadeTotal={item.quantidadeTotal} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatarData(item.estoqueZeradoEm)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/estoque/$produtoId" params={{ produtoId: item.produtoId }}>
                        <Settings2 aria-hidden className="size-3.5" /> Gerenciar
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Page>
  );
}
