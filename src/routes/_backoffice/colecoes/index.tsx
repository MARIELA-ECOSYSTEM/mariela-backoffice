import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { CardsSkeleton, DataToolbar, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import type { GrupoFacetaDef, SelecaoFacetas } from "@/lib/filtros/facetas";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PeriodoCard } from "@/components/cadastros/periodo-card";
import {
  PERIODO_VALORES_PADRAO,
  PeriodoDialog,
  type PeriodoFormValues,
} from "@/components/cadastros/periodo-dialog";
import {
  useAlterarStatusColecao,
  useAtualizarColecao,
  useColecoes,
  useCriarColecao,
  useRemoverColecao,
} from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import { OPCOES_BANNER, OPCOES_DESTAQUE, OPCOES_VIGENCIA, statusVigencia } from "@/utils/vitrine";
import type { Colecao, ColecaoFiltros } from "@/types/colecao";

export const Route = createFileRoute("/_backoffice/colecoes/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Coleções — MARIELA Backoffice" },
      {
        name: "description",
        content: "Coleções do catálogo Mariela com período, destaque e banner da vitrine.",
      },
      { property: "og:title", content: "Coleções — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Coleções do catálogo Mariela com período, destaque e banner da vitrine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ColecoesPage,
});

const POR_PAGINA = 12;

function ColecoesPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Colecao | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Colecao | null>(null);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Produtos/Clientes/Fornecedores.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criar = useCriarColecao();
  const atualizar = useAtualizarColecao();
  const alterarStatus = useAlterarStatusColecao();
  const remover = useRemoverColecao();

  // Busca ou facetas mudaram: o conjunto de resultados é outro, então a
  // paginação sempre recomeça em 1. Sem `pagina`/`limit` nesta dependência,
  // para o efeito abaixo não entrar em looping consigo mesmo a cada troca de página.
  const criteriosFiltro = useMemo(
    () => ({ busca: busca || undefined, facetas: selecao }),
    [busca, selecao],
  );

  useEffect(() => {
    setPagina(1);
  }, [criteriosFiltro]);

  const filtros = useMemo<ColecaoFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useColecoes(filtros);
  const colecoes = useMemo(() => data?.colecoes ?? [], [data?.colecoes]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  // A página pedida pode ficar fora do intervalo depois que o conjunto de
  // resultados muda de tamanho (ex.: uma coleção foi excluída e a página 5
  // deixou de existir) — corrige para a última página válida em vez de
  // deixar "página 5 de 3" na tela.
  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  const grupos = useMemo<GrupoFacetaDef<Colecao>[]>(
    () => [
      {
        id: "situacao",
        label: "Situação",
        opcoes: OPCOES_VIGENCIA,
        corresponde: (colecao, valor) => statusVigencia(colecao) === valor,
      },
      {
        id: "destaque",
        label: "Destaque",
        opcoes: OPCOES_DESTAQUE,
        corresponde: (colecao, valor) => (valor === "sim" ? colecao.destaque : !colecao.destaque),
      },
      {
        id: "banner",
        label: "Banner",
        opcoes: OPCOES_BANNER,
        corresponde: (colecao, valor) => (valor === "sim" ? colecao.banner : !colecao.banner),
      },
      {
        id: "produtos",
        label: "Produtos vinculados",
        opcoes: [
          { valor: "com", label: "Com produtos" },
          { valor: "sem", label: "Sem produtos" },
        ],
        corresponde: (colecao, valor) =>
          valor === "com" ? colecao.produtosVinculados > 0 : colecao.produtosVinculados === 0,
      },
    ],
    [],
  );

  const filtragem = useFiltrosFacetados({
    itens: colecoes,
    grupos,
    facetasExternas: data?.facets,
    selecao,
    onSelecaoChange: setSelecao,
  });

  const temFiltros = Boolean(busca) || filtragem.temSelecao;

  function limparFiltros() {
    setBusca("");
    filtragem.limparTudo();
  }

  const valoresIniciais: PeriodoFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        descricao: emEdicao.descricao,
        inicio: emEdicao.inicio,
        fim: emEdicao.fim,
        ativo: emEdicao.ativo,
        destaque: emEdicao.destaque,
        banner: emEdicao.banner,
        fotoDestaque: emEdicao.fotoDestaque ?? "",
        fotoBanner: emEdicao.fotoBanner ?? "",
      }
    : PERIODO_VALORES_PADRAO;

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

  async function alternarStatus(colecao: Colecao) {
    try {
      await alterarStatus.mutateAsync({ id: colecao.id, ativo: !colecao.ativo });
      toast.success(colecao.ativo ? "Coleção inativada." : "Coleção ativada.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
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

  return (
    <Page
      titulo="Coleções"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Coleções" }]}
      descricao="Agrupamento comercial do catálogo com período de vigência e conteúdo preparado para a vitrine virtual."
      acoes={
        <Button onClick={abrirNova}>
          <Plus aria-hidden className="size-4" />
          Nova coleção
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={setBusca}
        placeholder="Buscar por nome, descrição ou código…"
      />

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={limparFiltros}
        resultado={
          <span className="text-sm text-muted-foreground">{total} coleção(ões) encontrada(s)</span>
        }
      />

      {isPending ? (
        <CardsSkeleton itens={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhuma coleção encontrada"
          descricao="Ajuste a busca ou cadastre uma nova coleção para agrupar seus produtos."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={abrirNova}>
                <Plus aria-hidden className="size-4" />
                Nova coleção
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {colecoes.map((colecao) => (
            <PeriodoCard
              key={colecao.id}
              item={colecao}
              tipo="colecao"
              totalProdutos={colecao.produtosVinculados}
              onEditar={() => {
                setEmEdicao(colecao);
                setDialogAberto(true);
              }}
              onAlternarStatus={() => void alternarStatus(colecao)}
              onGerenciarProdutos={() =>
                void navigate({ to: "/colecoes/$id", params: { id: colecao.id } })
              }
              onExcluir={() => setParaExcluir(colecao)}
            />
          ))}
        </div>
      )}

      {total > 0 ? (
        <div className="mt-7 flex items-center justify-end">
          {isFetching ? <span className="text-xs text-muted-foreground">Atualizando…</span> : null}
        </div>
      ) : null}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={total}
        rotulo="coleção(ões)"
        onPaginaChange={setPagina}
      />

      <PeriodoDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        titulo={emEdicao ? "Editar coleção" : "Nova coleção"}
        descricaoDialog="Defina nome, descrição, período de vigência, status e o conteúdo de vitrine."
        codigo={emEdicao?.codigo ?? null}
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
