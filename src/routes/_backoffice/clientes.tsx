import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarHeart, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AtivoBadge,
  DataToolbar,
  NotaDemonstracao,
  Paginacao,
} from "@/components/common/data-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  CLIENTE_VALORES_PADRAO,
  ClienteDialog,
  type ClienteFormValues,
} from "@/components/cadastros/cliente-dialog";
import {
  useAtualizarCliente,
  useClientes,
  useCriarCliente,
  useRemoverCliente,
} from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData } from "@/utils/format";
import type { Cliente } from "@/types/cliente";

export const Route = createFileRoute("/_backoffice/clientes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clientes — MARIELA Backoffice" },
      { name: "description", content: "Cadastro e histórico de clientes da loja Mariela." },
      { property: "og:title", content: "Clientes — MARIELA Backoffice" },
      { property: "og:description", content: "Cadastro e histórico de clientes da loja Mariela." },
    ],
  }),
  component: ClientesPage,
});

const POR_PAGINA = 10;

function ClientesPage() {
  const { data: clientes, isPending, isError, error, refetch } = useClientes();
  const criar = useCriarCliente();
  const atualizar = useAtualizarCliente();
  const remover = useRemoverCliente();

  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (clientes ?? []).filter((cliente) => {
      const casaTermo =
        !termo ||
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.toLowerCase().includes(termo);
      const casaStatus =
        status === "todos" || (status === "ativos" ? cliente.ativo : !cliente.ativo);
      return casaTermo && casaStatus;
    });
  }, [clientes, busca, status]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: ClienteFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        telefone: emEdicao.telefone,
        dataNascimento: emEdicao.dataNascimento ?? "",
        observacao: emEdicao.observacao,
        ativo: emEdicao.ativo,
      }
    : CLIENTE_VALORES_PADRAO;

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: ClienteFormValues) {
    const payload = {
      nome: valores.nome,
      telefone: valores.telefone,
      dataNascimento: valores.dataNascimento || null,
      observacao: valores.observacao,
      ativo: valores.ativo,
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Cliente atualizado." : "Cliente cadastrado.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o cliente."));
    }
  }

  async function excluir(cliente: Cliente) {
    try {
      await remover.mutateAsync(cliente.id);
      toast.success("Cliente excluído.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o cliente."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Clientes"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Clientes" }]}
      descricao="Base de clientes da loja com telefone, data de nascimento, observações e status."
      acoes={
        <Button onClick={abrirNovo}>
          <Plus aria-hidden className="size-4" />
          Novo cliente
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={(valor) => {
          setBusca(valor);
          setPagina(1);
        }}
        placeholder="Buscar por nome ou telefone…"
      >
        <Select
          value={status}
          onValueChange={(valor) => {
            setStatus(valor);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativos">Somente ativos</SelectItem>
            <SelectItem value="inativos">Somente inativos</SelectItem>
          </SelectContent>
        </Select>
      </DataToolbar>

      {isPending ? (
        <TableSkeleton linhas={8} colunas={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre a primeira cliente da loja."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Novo cliente
            </Button>
          }
        />
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDetalhe(cliente)}
                        className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {cliente.nome}
                      </button>
                      {cliente.observacao ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {cliente.observacao}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{cliente.telefone || "—"}</TableCell>
                    <TableCell>{formatarData(cliente.dataNascimento)}</TableCell>
                    <TableCell>
                      <AtivoBadge ativo={cliente.ativo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${cliente.nome}`}
                          onClick={() => {
                            setEmEdicao(cliente);
                            setDialogAberto(true);
                          }}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${cliente.nome}`}
                          onClick={() => setParaExcluir(cliente)}
                        >
                          <Trash2 aria-hidden className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={filtrados.length}
        rotulo="cliente(s)"
        onPaginaChange={setPagina}
      />

      <ClienteDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        edicao={emEdicao !== null}
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={(valores) => void salvar(valores)}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir cliente"
        descricao={
          paraExcluir ? `O cadastro de "${paraExcluir.nome}" será removido permanentemente.` : ""
        }
        confirmarLabel="Excluir"
        onConfirm={() => {
          if (paraExcluir) void excluir(paraExcluir);
        }}
      />

      <Sheet
        open={detalhe !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-3xl">{detalhe?.nome}</SheetTitle>
            <SheetDescription>Ficha da cliente e histórico de compras.</SheetDescription>
          </SheetHeader>

          {detalhe ? (
            <div className="space-y-6 px-4 pb-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd>{detalhe.telefone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nascimento</dt>
                  <dd className="flex items-center gap-2">
                    <CalendarHeart aria-hidden className="size-4 text-primary/70" />
                    {formatarData(detalhe.dataNascimento)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <AtivoBadge ativo={detalhe.ativo} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Cadastro</dt>
                  <dd>{formatarData(detalhe.criadoEm)}</dd>
                </div>
              </dl>

              {detalhe.observacao ? (
                <div className="rounded-lg border border-border bg-surface/60 p-4">
                  <p className="text-eyebrow mb-1">Observação</p>
                  <p className="text-sm leading-relaxed">{detalhe.observacao}</p>
                </div>
              ) : null}

              <div>
                <p className="text-eyebrow mb-3">Histórico de vendas</p>
                <NotaDemonstracao>
                  O histórico de compras será alimentado pelo MARIELA PDV. Nenhuma venda é
                  registrada ou simulada nesta etapa.
                </NotaDemonstracao>
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-10 text-center">
                  <ShoppingBag aria-hidden className="size-6 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma venda vinculada a esta cliente.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
