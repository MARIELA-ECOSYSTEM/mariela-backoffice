import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { CardsSkeleton, DataToolbar, NotaDemonstracao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { OPCOES_STATUS, type GrupoFacetaDef } from "@/lib/filtros/facetas";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PeriodoCard } from "@/components/cadastros/periodo-card";
import { PeriodoDialog, type PeriodoFormValues } from "@/components/cadastros/periodo-dialog";
import {
  useAtualizarColecao,
  useColecoes,
  useCriarColecao,
  useRemoverColecao,
} from "@/hooks/use-cadastros";
import { useProdutos } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import type { Colecao } from "@/types/colecao";

export const Route = createFileRoute("/_backoffice/colecoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Coleções — MARIELA Backoffice" },
      { name: "description", content: "Coleções do catálogo Mariela com período e status." },
      { property: "og:title", content: "Coleções — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Coleções do catálogo Mariela com período e status.",
      },
    ],
  }),
  component: ColecoesPage,
});

const VALORES_PADRAO: PeriodoFormValues = {
  nome: "",
  descricao: "",
  inicio: new Date().toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  ativo: true,
};

function ColecoesPage() {
  const { data: colecoes, isPending, isError, error, refetch } = useColecoes();
  const { data: produtos } = useProdutos({});
  const criar = useCriarColecao();
  const atualizar = useAtualizarColecao();
  const remover = useRemoverColecao();

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Colecao | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Colecao | null>(null);

  const listaProdutos = useMemo(() => produtos?.produtos ?? [], [produtos]);

  const grupos = useMemo<GrupoFacetaDef<Colecao>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (colecao, valor) => (valor === "ativos" ? colecao.ativo : !colecao.ativo),
      },
      {
        id: "vigencia",
        label: "Vigência",
        opcoes: [
          { valor: "vigente", label: "Em vigência" },
          { valor: "futura", label: "Programada" },
          { valor: "encerrada", label: "Encerrada" },
        ],
        corresponde: (colecao, valor) => {
          const hoje = new Date().toISOString().slice(0, 10);
          if (valor === "vigente") return colecao.inicio <= hoje && colecao.fim >= hoje;
          if (valor === "futura") return colecao.inicio > hoje;
          return colecao.fim < hoje;
        },
      },
      {
        id: "produtos",
        label: "Produtos vinculados",
        opcoes: [
          { valor: "com", label: "Com produtos" },
          { valor: "sem", label: "Sem produtos" },
        ],
        corresponde: (colecao, valor) => {
          const quantidade = listaProdutos.filter(
            (produto) => produto.colecaoId === colecao.id,
          ).length;
          return valor === "com" ? quantidade > 0 : quantidade === 0;
        },
      },
    ],
    [listaProdutos],
  );

  const buscadas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return colecoes ?? [];
    return (colecoes ?? []).filter(
      (colecao) =>
        colecao.nome.toLowerCase().includes(termo) ||
        colecao.descricao.toLowerCase().includes(termo),
    );
  }, [colecoes, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscadas, grupos });
  const filtradas = filtragem.itensFiltrados;

  const valoresIniciais: PeriodoFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        descricao: emEdicao.descricao,
        inicio: emEdicao.inicio,
        fim: emEdicao.fim,
        ativo: emEdicao.ativo,
      }
    : VALORES_PADRAO;

  function abrirNova() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: PeriodoFormValues) {
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload: valores });
      else await criar.mutateAsync(valores);
      toast.success(emEdicao ? "Coleção atualizada." : "Coleção criada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a coleção."));
    }
  }

  async function excluir(colecao: Colecao) {
    try {
      await remover.mutateAsync(colecao.id);
      toast.success("Coleção excluída.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir a coleção."));
    } finally {
      setParaExcluir(null);
    }
  }

  function contarProdutos(colecaoId: string): number {
    return (produtos?.produtos ?? []).filter((produto) => produto.colecaoId === colecaoId).length;
  }

  return (
    <Page
      titulo="Coleções"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Coleções" }]}
      descricao="Organize o catálogo em coleções com período de vigência. A relação com produtos acontece por produto.colecaoId."
      acoes={
        <Button onClick={abrirNova}>
          <Plus aria-hidden className="size-4" />
          Nova coleção
        </Button>
      }
    >
      <NotaDemonstracao>
        As coleções são servidas pela camada mock preparada para os contratos <code>/colecoes</code>{" "}
        da futura API.
      </NotaDemonstracao>

      <DataToolbar busca={busca} onBuscaChange={setBusca} placeholder="Buscar coleção…" />

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        colunas={3}
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtradas.length} coleção(ões) encontrada(s)
          </span>
        }
      />

      {isPending ? (
        <CardsSkeleton itens={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma coleção encontrada"
          descricao="Ajuste a busca ou cadastre uma nova coleção para agrupar seus produtos."
          acao={
            <Button onClick={abrirNova}>
              <Plus aria-hidden className="size-4" />
              Nova coleção
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((colecao) => (
            <PeriodoCard
              key={colecao.id}
              item={colecao}
              totalProdutos={contarProdutos(colecao.id)}
              onEditar={() => {
                setEmEdicao(colecao);
                setDialogAberto(true);
              }}
              onExcluir={() => setParaExcluir(colecao)}
            />
          ))}
        </div>
      )}

      <PeriodoDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        titulo={emEdicao ? "Editar coleção" : "Nova coleção"}
        descricaoDialog="Defina nome, descrição, período de vigência e se a coleção está ativa."
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={(valores) => void salvar(valores)}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir coleção"
        descricao={
          paraExcluir
            ? `A coleção "${paraExcluir.nome}" será excluída. Coleções com produtos vinculados não podem ser removidas.`
            : ""
        }
        confirmarLabel="Excluir"
        onConfirm={() => {
          if (paraExcluir) void excluir(paraExcluir);
        }}
      />
    </Page>
  );
}
