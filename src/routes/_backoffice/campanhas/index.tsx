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
  useAlterarStatusCampanha,
  useAtualizarCampanha,
  useCampanhas,
  useCriarCampanha,
  useRemoverCampanha,
} from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import { OPCOES_BANNER, OPCOES_DESTAQUE, OPCOES_VIGENCIA, statusVigencia } from "@/utils/vitrine";
import type { Campanha, CampanhaFiltros } from "@/types/campanha";

export const Route = createFileRoute("/_backoffice/campanhas/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Campanhas — MARIELA Backoffice" },
      {
        name: "description",
        content: "Campanhas da loja Mariela com período, banner e produtos vinculados.",
      },
      { property: "og:title", content: "Campanhas — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Campanhas da loja Mariela com período, banner e produtos vinculados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhasPage,
});

const POR_PAGINA = 12;

function CampanhasPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Campanha | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Campanha | null>(null);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Produtos/Clientes/Fornecedores/Coleções.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criar = useCriarCampanha();
  const atualizar = useAtualizarCampanha();
  const alterarStatus = useAlterarStatusCampanha();
  const remover = useRemoverCampanha();

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

  const filtros = useMemo<CampanhaFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useCampanhas(filtros);
  const campanhas = useMemo(() => data?.campanhas ?? [], [data?.campanhas]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  // A página pedida pode ficar fora do intervalo depois que o conjunto de
  // resultados muda de tamanho (ex.: uma campanha foi excluída e a página 5
  // deixou de existir) — corrige para a última página válida em vez de
  // deixar "página 5 de 3" na tela.
  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  const grupos = useMemo<GrupoFacetaDef<Campanha>[]>(
    () => [
      {
        id: "situacao",
        label: "Situação",
        opcoes: OPCOES_VIGENCIA,
        corresponde: (campanha, valor) => statusVigencia(campanha) === valor,
      },
      {
        id: "destaque",
        label: "Destaque",
        opcoes: OPCOES_DESTAQUE,
        corresponde: (campanha, valor) =>
          valor === "sim" ? campanha.destaque : !campanha.destaque,
      },
      {
        id: "banner",
        label: "Banner",
        opcoes: OPCOES_BANNER,
        corresponde: (campanha, valor) => (valor === "sim" ? campanha.banner : !campanha.banner),
      },
      {
        id: "produtos",
        label: "Produtos vinculados",
        opcoes: [
          { valor: "com", label: "Com produtos" },
          { valor: "sem", label: "Sem produtos" },
        ],
        corresponde: (campanha, valor) =>
          valor === "com" ? campanha.produtosVinculados > 0 : campanha.produtosVinculados === 0,
      },
    ],
    [],
  );

  const filtragem = useFiltrosFacetados({
    itens: campanhas,
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
      toast.success(emEdicao ? "Campanha atualizada." : "Campanha criada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a campanha."));
    }
  }

  async function alternarStatus(campanha: Campanha) {
    try {
      await alterarStatus.mutateAsync({ id: campanha.id, ativo: !campanha.ativo });
      toast.success(campanha.ativo ? "Campanha inativada." : "Campanha ativada.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
    }
  }

  async function excluir(campanha: Campanha) {
    try {
      await remover.mutateAsync(campanha.id);
      toast.success("Campanha excluída.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir a campanha."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Campanhas"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Campanhas" }]}
      descricao="Ações de comunicação e venda por período, com banners preparados para a vitrine virtual."
      acoes={
        <Button onClick={abrirNova}>
          <Plus aria-hidden className="size-4" />
          Nova campanha
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
          <span className="text-sm text-muted-foreground">{total} campanha(s) encontrada(s)</span>
        }
      />

      {isPending ? (
        <CardsSkeleton itens={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhuma campanha encontrada"
          descricao="Ajuste a busca ou cadastre uma nova campanha para impulsionar as vendas."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={abrirNova}>
                <Plus aria-hidden className="size-4" />
                Nova campanha
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
          {campanhas.map((campanha) => (
            <PeriodoCard
              key={campanha.id}
              item={campanha}
              tipo="campanha"
              totalProdutos={campanha.produtosVinculados}
              onEditar={() => {
                setEmEdicao(campanha);
                setDialogAberto(true);
              }}
              onAlternarStatus={() => void alternarStatus(campanha)}
              onGerenciarProdutos={() =>
                void navigate({ to: "/campanhas/$id", params: { id: campanha.id } })
              }
              onExcluir={() => setParaExcluir(campanha)}
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
        rotulo="campanha(s)"
        onPaginaChange={setPagina}
      />

      <PeriodoDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        titulo={emEdicao ? "Editar campanha" : "Nova campanha"}
        descricaoDialog="Defina nome, descrição, período, status e o conteúdo de vitrine."
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
        titulo="Excluir campanha"
        descricao={
          paraExcluir
            ? `A campanha "${paraExcluir.nome}" será excluída. Campanhas com produtos vinculados não podem ser removidas.`
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
