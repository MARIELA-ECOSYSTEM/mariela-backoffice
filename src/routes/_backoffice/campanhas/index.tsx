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
  useAlterarStatusCampanha,
  useAtualizarCampanha,
  useCampanhas,
  useCriarCampanha,
  useRemoverCampanha,
} from "@/hooks/use-cadastros";
import { useProdutos } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { OPCOES_BANNER, OPCOES_DESTAQUE, OPCOES_VIGENCIA, statusVigencia } from "@/utils/vitrine";
import type { Campanha } from "@/types/campanha";

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

function CampanhasPage() {
  const navigate = useNavigate();
  const { data: campanhas, isPending, isError, error, refetch } = useCampanhas();
  const { data: produtos } = useProdutos({});
  const criar = useCriarCampanha();
  const atualizar = useAtualizarCampanha();
  const alterarStatus = useAlterarStatusCampanha();
  const remover = useRemoverCampanha();

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Campanha | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Campanha | null>(null);

  const listaProdutos = useMemo(() => produtos?.produtos ?? [], [produtos]);

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
        corresponde: (campanha, valor) => {
          const quantidade = listaProdutos.filter(
            (produto) => produto.campanhaId === campanha.id,
          ).length;
          return valor === "com" ? quantidade > 0 : quantidade === 0;
        },
      },
    ],
    [listaProdutos],
  );

  const buscadas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return campanhas ?? [];
    return (campanhas ?? []).filter(
      (campanha) =>
        campanha.nome.toLowerCase().includes(termo) ||
        campanha.descricao.toLowerCase().includes(termo) ||
        campanha.codigo.toLowerCase().includes(termo),
    );
  }, [campanhas, busca]);

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
      toast.success(emEdicao ? "Campanha atualizada." : "Campanha criada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a campanha."));
      throw err;
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
      throw err;
    }
  }

  function contarProdutos(campanhaId: string): number {
    return listaProdutos.filter((produto) => produto.campanhaId === campanhaId).length;
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
        onLimparTudo={filtragem.limparTudo}
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtradas.length} campanha(s) encontrada(s)
          </span>
        }
      />

      {isPending ? (
        <CardsSkeleton itens={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma campanha encontrada"
          descricao="Ajuste a busca ou cadastre uma nova campanha para impulsionar as vendas."
          acao={
            <Button onClick={abrirNova}>
              <Plus aria-hidden className="size-4" />
              Nova campanha
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
          {filtradas.map((campanha) => (
            <PeriodoCard
              key={campanha.id}
              item={campanha}
              tipo="campanha"
              totalProdutos={contarProdutos(campanha.id)}
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
        onSubmit={salvar}
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
        onConfirm={async () => {
          if (paraExcluir) await excluir(paraExcluir);
        }}
      />
    </Page>
  );
}
