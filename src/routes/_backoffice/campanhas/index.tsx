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
  useAtualizarCampanha,
  useCampanhas,
  useCriarCampanha,
  useRemoverCampanha,
} from "@/hooks/use-cadastros";
import { useProdutos } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import type { Campanha } from "@/types/campanha";

export const Route = createFileRoute("/_backoffice/campanhas/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Campanhas — MARIELA Backoffice" },
      { name: "description", content: "Campanhas da loja Mariela com período e status." },
      { property: "og:title", content: "Campanhas — MARIELA Backoffice" },
      { property: "og:description", content: "Campanhas da loja Mariela com período e status." },
    ],
  }),
  component: CampanhasPage,
});

const VALORES_PADRAO: PeriodoFormValues = {
  nome: "",
  descricao: "",
  inicio: new Date().toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  ativo: true,
};

function CampanhasPage() {
  const { data: campanhas, isPending, isError, error, refetch } = useCampanhas();
  const { data: produtos } = useProdutos({});
  const criar = useCriarCampanha();
  const atualizar = useAtualizarCampanha();
  const remover = useRemoverCampanha();

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Campanha | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Campanha | null>(null);

  const listaProdutos = useMemo(() => produtos?.produtos ?? [], [produtos]);

  const grupos = useMemo<GrupoFacetaDef<Campanha>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (campanha, valor) => (valor === "ativos" ? campanha.ativo : !campanha.ativo),
      },
      {
        id: "vigencia",
        label: "Vigência",
        opcoes: [
          { valor: "vigente", label: "Em vigência" },
          { valor: "futura", label: "Programada" },
          { valor: "encerrada", label: "Encerrada" },
        ],
        corresponde: (campanha, valor) => {
          const hoje = new Date().toISOString().slice(0, 10);
          if (valor === "vigente") return campanha.inicio <= hoje && campanha.fim >= hoje;
          if (valor === "futura") return campanha.inicio > hoje;
          return campanha.fim < hoje;
        },
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
        campanha.descricao.toLowerCase().includes(termo),
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
      toast.success(emEdicao ? "Campanha atualizada." : "Campanha criada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a campanha."));
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

  function contarProdutos(campanhaId: string): number {
    return (produtos?.produtos ?? []).filter((produto) => produto.campanhaId === campanhaId).length;
  }

  return (
    <Page
      titulo="Campanhas"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Campanhas" }]}
      descricao="Ações de divulgação com período definido. A relação com produtos acontece por produto.campanhaId."
      acoes={
        <Button onClick={abrirNova}>
          <Plus aria-hidden className="size-4" />
          Nova campanha
        </Button>
      }
    >
      <NotaDemonstracao>
        As campanhas são servidas pela camada mock preparada para os contratos{" "}
        <code>/campanhas</code> da futura API. Nenhuma regra de desconto é aplicada aqui.
      </NotaDemonstracao>

      <DataToolbar busca={busca} onBuscaChange={setBusca} placeholder="Buscar campanha…" />

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        colunas={3}
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
          descricao="Ajuste a busca ou cadastre uma nova campanha para organizar suas ações."
          acao={
            <Button onClick={abrirNova}>
              <Plus aria-hidden className="size-4" />
              Nova campanha
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((campanha) => (
            <PeriodoCard
              key={campanha.id}
              item={campanha}
              totalProdutos={contarProdutos(campanha.id)}
              onEditar={() => {
                setEmEdicao(campanha);
                setDialogAberto(true);
              }}
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
        descricaoDialog="Defina nome, descrição, período de vigência e se a campanha está ativa."
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
