import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AtivoBadge, DataToolbar, Paginacao } from "@/components/common/data-toolbar";
import { AcoesLinha } from "@/components/common/acoes-linha";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  ADQUIRENTE_VALORES_PADRAO,
  AdquirenteDialog,
  type AdquirenteFormValues,
} from "@/components/cadastros/adquirente-dialog";
import {
  useAdquirentes,
  useAlterarStatusAdquirente,
  useAtualizarAdquirente,
  useCriarAdquirente,
  useRemoverAdquirente,
} from "@/hooks/use-adquirentes";
import { mensagemDeErro } from "@/services/api/client";
import { LABEL_MODALIDADE_TARIFA } from "@/types/adquirente";
import { formatarPercentual } from "@/utils/format";
import type { Adquirente } from "@/types/adquirente";

export const Route = createFileRoute("/_backoffice/adquirentes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Adquirentes — MARIELA Backoffice" },
      {
        name: "description",
        content: "Adquirentes de cartão e tabela de tarifas usada no recebimento de vendas.",
      },
      { property: "og:title", content: "Adquirentes — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Adquirentes de cartão e tabela de tarifas usada no recebimento de vendas.",
      },
    ],
  }),
  component: AdquirentesPage,
});

const LIMITE_POR_PAGINA = 20;

function ResumoTarifas({ tabelaTarifas }: { tabelaTarifas: Adquirente["tabelaTarifas"] }) {
  if (tabelaTarifas.length === 0) {
    return <span className="text-sm text-muted-foreground">Sem tarifas configuradas</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabelaTarifas.map((tarifa) => (
        <Badge key={tarifa.id} variant="outline" className="whitespace-nowrap">
          {LABEL_MODALIDADE_TARIFA[tarifa.modalidade]} {tarifa.parcelas}x ·{" "}
          {formatarPercentual(tarifa.percentual)}
        </Badge>
      ))}
    </div>
  );
}

function AdquirentesPage() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const { data, isPending, isError, error, refetch } = useAdquirentes({
    busca: busca || undefined,
    page: pagina,
    limit: LIMITE_POR_PAGINA,
  });

  const criar = useCriarAdquirente();
  const atualizar = useAtualizarAdquirente();
  const alterarStatus = useAlterarStatusAdquirente();
  const remover = useRemoverAdquirente();

  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Adquirente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Adquirente | null>(null);
  // Guarda síncrona via ref: o botão "Ativar/Inativar adquirente" é um
  // botão avulso na linha da tabela (sem menu), sem guarda própria — duplo
  // clique real disparava duas mutations aceitas pelo backend (Etapa 20.17).
  const alternandoStatusRef = useRef(false);

  const adquirentes = data?.adquirentes ?? [];
  const total = data?.meta.total ?? 0;
  const totalPaginas = data?.meta.totalPages ?? 1;

  const valoresIniciais: AdquirenteFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        ativo: emEdicao.ativo,
        observacao: emEdicao.observacao ?? "",
        tabelaTarifas: emEdicao.tabelaTarifas.map((tarifa) => ({
          modalidade: tarifa.modalidade,
          parcelas: tarifa.parcelas,
          percentual: tarifa.percentual,
        })),
      }
    : ADQUIRENTE_VALORES_PADRAO;

  function abrirNova() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: AdquirenteFormValues) {
    const payload = {
      nome: valores.nome,
      ativo: valores.ativo,
      observacao: valores.observacao || null,
      tabelaTarifas: valores.tabelaTarifas,
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Adquirente atualizada." : "Adquirente cadastrada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar a adquirente."));
      throw err;
    }
  }

  async function alternarStatus(adquirente: Adquirente) {
    if (alternandoStatusRef.current) return;
    alternandoStatusRef.current = true;
    try {
      await alterarStatus.mutateAsync({ id: adquirente.id, ativo: !adquirente.ativo });
      toast.success(adquirente.ativo ? "Adquirente inativada." : "Adquirente ativada.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
    } finally {
      alternandoStatusRef.current = false;
    }
  }

  async function excluir(adquirente: Adquirente) {
    try {
      await remover.mutateAsync(adquirente.id);
      toast.success("Adquirente excluída.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir a adquirente."));
      throw err;
    }
  }

  return (
    <Page
      titulo="Adquirentes"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Adquirentes" }]}
      descricao="Adquirentes de cartão e a tabela de tarifas usada no recebimento de vendas no débito/crédito."
      acoes={
        <Button onClick={abrirNova}>
          <Plus aria-hidden className="size-4" />
          Nova adquirente
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={(valor) => {
          setBusca(valor);
          setPagina(1);
        }}
        placeholder="Buscar por nome…"
      >
        {!isPending && !isError ? (
          <span className="text-sm text-muted-foreground">{total} adquirente(s) encontrada(s)</span>
        ) : null}
      </DataToolbar>

      {isPending ? (
        <TableSkeleton linhas={4} colunas={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : adquirentes.length === 0 ? (
        <EmptyState
          titulo={busca ? "Nenhuma adquirente encontrada" : "Não há adquirentes cadastradas"}
          descricao={
            busca
              ? "Ajuste a busca para localizar a adquirente desejada."
              : "Cadastre a primeira adquirente de cartão para usar suas tarifas no recebimento de vendas."
          }
          acao={
            <Button onClick={abrirNova}>
              <Plus aria-hidden className="size-4" />
              Nova adquirente
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adquirente</TableHead>
                <TableHead>Tarifas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adquirentes.map((adquirente) => (
                <TableRow key={adquirente.id}>
                  <TableCell>
                    <div className="flex items-center gap-3 py-1">
                      <CreditCard aria-hidden className="size-4 text-muted-foreground/70" />
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{adquirente.nome}</span>
                        {adquirente.observacao ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {adquirente.observacao}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-64 py-2">
                    <ResumoTarifas tabelaTarifas={adquirente.tabelaTarifas} />
                  </TableCell>
                  <TableCell>
                    <AtivoBadge ativo={adquirente.ativo} />
                  </TableCell>
                  <TableCell className="text-right">
                    <AcoesLinha
                      acoes={[
                        {
                          label: "Editar adquirente",
                          icon: Pencil,
                          onClick: () => {
                            setEmEdicao(adquirente);
                            setDialogAberto(true);
                          },
                        },
                        {
                          label: adquirente.ativo ? "Inativar adquirente" : "Ativar adquirente",
                          icon: Power,
                          disabled: alterarStatus.isPending,
                          onClick: () => void alternarStatus(adquirente),
                        },
                        {
                          label: "Excluir adquirente",
                          icon: Trash2,
                          destrutivo: true,
                          onClick: () => setParaExcluir(adquirente),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Paginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        total={total}
        rotulo="adquirente(s)"
        onPaginaChange={setPagina}
      />

      <AdquirenteDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        edicao={emEdicao !== null}
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={salvar}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir adquirente"
        descricao={
          paraExcluir ? `"${paraExcluir.nome}" será excluída. Esta ação não pode ser desfeita.` : ""
        }
        confirmarLabel="Excluir"
        onConfirm={async () => {
          if (paraExcluir) await excluir(paraExcluir);
        }}
      />
    </Page>
  );
}
