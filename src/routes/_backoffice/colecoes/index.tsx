import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { CardsSkeleton, DataToolbar } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import type { GrupoFacetaDef } from "@/lib/filtros/facetas";
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
import { useProdutos } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { OPCOES_BANNER, OPCOES_DESTAQUE, OPCOES_VIGENCIA, statusVigencia } from "@/utils/vitrine";
import type { Colecao } from "@/types/colecao";

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

function ColecoesPage() {
  const navigate = useNavigate();
  const { data: colecoes, isPending, isError, error, refetch } = useColecoes();
  const { data: produtos } = useProdutos({});
  const criar = useCriarColecao();
  const atualizar = useAtualizarColecao();
  const alterarStatus = useAlterarStatusColecao();
  const remover = useRemoverColecao();

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Colecao | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Colecao | null>(null);

  const listaProdutos = useMemo(() => produtos?.produtos ?? [], [produtos]);

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
        colecao.descricao.toLowerCase().includes(termo) ||
        colecao.codigo.toLowerCase().includes(termo),
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
      throw err;
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
      throw err;
    }
  }

  function contarProdutos(colecaoId: string): number {
    return listaProdutos.filter((produto) => produto.colecaoId === colecaoId).length;
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
        onLimparTudo={filtragem.limparTudo}
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtradas.map((colecao) => (
            <PeriodoCard
              key={colecao.id}
              item={colecao}
              tipo="colecao"
              totalProdutos={contarProdutos(colecao.id)}
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
        onSubmit={salvar}
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
        onConfirm={async () => {
          if (paraExcluir) await excluir(paraExcluir);
        }}
      />
    </Page>
  );
}
