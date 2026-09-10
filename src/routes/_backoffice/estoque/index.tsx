import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { BuscaInput } from "@/components/common/data-toolbar";
import { Button } from "@/components/ui/button";
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
import { MiniaturaProduto } from "@/components/estoque/miniatura-produto";
import { CoresTamanhos } from "@/components/estoque/cores-tamanhos";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { opcoesDeValores, type GrupoFacetaDef } from "@/lib/filtros/facetas";
import { useEstoque } from "@/hooks/use-estoque";
import { useCampanhas, useColecoes } from "@/hooks/use-cadastros";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/utils/format";

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

type ItemEstoque = NonNullable<ReturnType<typeof useEstoque>["data"]>[number];

function EstoquePage() {
  const [busca, setBusca] = useState("");
  const { data, isPending, isError, error, refetch } = useEstoque({
    busca: busca || undefined,
  });
  const dados = useMemo(() => data ?? [], [data]);
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();

  const nomeColecao = useMemo(() => {
    const mapa = new Map<string, string>();
    (colecoes ?? []).forEach((colecao) => mapa.set(colecao.id, colecao.nome));
    return mapa;
  }, [colecoes]);
  const nomeCampanha = useMemo(() => {
    const mapa = new Map<string, string>();
    (campanhas ?? []).forEach((campanha) => mapa.set(campanha.id, campanha.nome));
    return mapa;
  }, [campanhas]);

  const grupos = useMemo<GrupoFacetaDef<ItemEstoque>[]>(() => {
    const categorias = Array.from(new Set(dados.map((item) => item.categoria))).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    return [
      {
        id: "disponibilidade",
        label: "Disponibilidade",
        opcoes: [
          { valor: "disponivel", label: "Disponível" },
          { valor: "sem-estoque", label: "Sem estoque" },
        ],
        corresponde: (item, valor) =>
          valor === "disponivel" ? item.quantidadeTotal > 0 : item.quantidadeTotal === 0,
      },
      {
        id: "categoria",
        label: "Categoria",
        opcoes: opcoesDeValores(categorias),
        corresponde: (item, valor) => item.categoria === valor,
        placeholderBusca: "Buscar categoria…",
      },
      {
        id: "colecao",
        label: "Coleção",
        opcoes: [
          ...Array.from(nomeColecao.entries())
            .filter(([id]) => dados.some((item) => item.colecaoId === id))
            .map(([id, nome]) => ({ valor: id, label: nome }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
          { valor: "__sem__", label: "Sem coleção" },
        ],
        corresponde: (item, valor) =>
          valor === "__sem__" ? !item.colecaoId : item.colecaoId === valor,
        placeholderBusca: "Buscar coleção…",
      },
      {
        id: "campanha",
        label: "Campanha",
        opcoes: [
          ...Array.from(nomeCampanha.entries())
            .filter(([id]) => dados.some((item) => item.campanhaId === id))
            .map(([id, nome]) => ({ valor: id, label: nome }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
          { valor: "__sem__", label: "Sem campanha" },
        ],
        corresponde: (item, valor) =>
          valor === "__sem__" ? !item.campanhaId : item.campanhaId === valor,
        placeholderBusca: "Buscar campanha…",
      },
      {
        id: "variantes",
        label: "Variantes",
        opcoes: [
          { valor: "com", label: "Com variantes" },
          { valor: "sem", label: "Sem variantes" },
        ],
        corresponde: (item, valor) =>
          valor === "com" ? item.totalVariantes > 0 : item.totalVariantes === 0,
      },
    ];
  }, [dados, nomeColecao, nomeCampanha]);

  const filtragem = useFiltrosFacetados({ itens: dados, grupos });
  const itens = filtragem.itensFiltrados;
  const temFiltros = Boolean(busca) || filtragem.temSelecao;

  function limpar() {
    setBusca("");
    filtragem.limparTudo();
  }

  return (
    <Page
      titulo="Estoque"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Estoque" }]}
      descricao="O estoque pertence ao produto: total, variantes por cor e quantidade por tamanho. As alterações são feitas por entrada e saída."
    >
      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={limpar}
        colunas={3}
        resultado={
          <span className="text-sm text-muted-foreground">{itens.length} produto(s) no filtro</span>
        }
        cabecalho={
          <BuscaInput
            valor={busca}
            onValorChange={setBusca}
            placeholder="Buscar por nome…"
            ariaLabel="Buscar produto no estoque"
          />
        }
      />

      {isPending ? (
        <TableSkeleton linhas={8} colunas={4} />
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
                <TableHead className="w-36">Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Coleção / Campanha</TableHead>
                <TableHead>Cores e tamanhos</TableHead>
                <TableHead>Quantidade total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zerado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => (
                <TableRow key={item.produtoId}>
                  <TableCell>
                    <div className="flex items-center gap-4 py-2">
                      <MiniaturaProduto fotos={item.fotos ?? []} alt={item.nome} />
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{item.nome}</span>
                        <span className="text-xs text-muted-foreground">{item.categoria}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.categoria}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex flex-col items-start gap-1">
                      {item.colecaoId && nomeColecao.get(item.colecaoId) ? (
                        <Badge variant="secondary" className="max-w-44 truncate">
                          {nomeColecao.get(item.colecaoId)}
                        </Badge>
                      ) : null}
                      {item.campanhaId && nomeCampanha.get(item.campanhaId) ? (
                        <Badge variant="outline" className="max-w-44 truncate">
                          {nomeCampanha.get(item.campanhaId)}
                        </Badge>
                      ) : null}
                      {!item.colecaoId && !item.campanhaId ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-56 py-3">
                    <CoresTamanhos cores={item.cores ?? []} />
                  </TableCell>
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
