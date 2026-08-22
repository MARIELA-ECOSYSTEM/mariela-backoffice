import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarHeart, Pencil, Phone, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
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
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { OPCOES_STATUS, type GrupoFacetaDef } from "@/lib/filtros/facetas";
import {
  AvatarPessoa,
  GridSkeleton,
  PessoaCard,
  PessoaGrid,
} from "@/components/common/pessoa-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  CLIENTE_VALORES_PADRAO,
  ClienteDialog,
  type ClienteFormValues,
} from "@/components/cadastros/cliente-dialog";
import {
  useAlterarStatusCliente,
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

const POR_PAGINA = 12;

type Ordenacao = "nome" | "recentes" | "nascimento";

function ordenar(lista: Cliente[], ordem: Ordenacao): Cliente[] {
  const copia = [...lista];
  if (ordem === "nome") return copia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (ordem === "recentes") return copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return copia.sort((a, b) =>
    (a.dataNascimento ?? "9999").localeCompare(b.dataNascimento ?? "9999"),
  );
}

function ClientesPage() {
  const { data: clientes, isPending, isError, error, refetch } = useClientes();
  const criar = useCriarCliente();
  const atualizar = useAtualizarCliente();
  const alterarStatus = useAlterarStatusCliente();
  const remover = useRemoverCliente();

  const [busca, setBusca] = useState("");

  const [ordem, setOrdem] = useState<Ordenacao>("nome");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);

  const grupos = useMemo<GrupoFacetaDef<Cliente>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (cliente, valor) => (valor === "ativos" ? cliente.ativo : !cliente.ativo),
      },
      {
        id: "nascimento",
        label: "Aniversário",
        opcoes: [
          { valor: "com", label: "Com data cadastrada" },
          { valor: "sem", label: "Sem data cadastrada" },
        ],
        corresponde: (cliente, valor) =>
          valor === "com" ? Boolean(cliente.dataNascimento) : !cliente.dataNascimento,
      },
      {
        id: "observacao",
        label: "Observação",
        opcoes: [
          { valor: "com", label: "Com observação" },
          { valor: "sem", label: "Sem observação" },
        ],
        corresponde: (cliente, valor) =>
          valor === "com" ? Boolean(cliente.observacao) : !cliente.observacao,
      },
    ],
    [],
  );

  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (clientes ?? []).filter(
      (cliente) =>
        !termo ||
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.toLowerCase().includes(termo),
    );
  }, [clientes, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscados, grupos });
  const filtrados = useMemo(
    () => ordenar(filtragem.itensFiltrados, ordem),
    [filtragem.itensFiltrados, ordem],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: ClienteFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
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
      foto: valores.foto || null,
      telefone: valores.telefone,
      dataNascimento: valores.dataNascimento || null,
      observacao: valores.observacao,
      ativo: valores.ativo,
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Cliente atualizada." : "Cliente cadastrada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o cliente."));
    }
  }

  async function alternarStatus(cliente: Cliente) {
    try {
      await alterarStatus.mutateAsync({ id: cliente.id, ativo: !cliente.ativo });
      toast.success(cliente.ativo ? "Cliente inativada." : "Cliente ativada.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
    }
  }

  async function excluir(cliente: Cliente) {
    try {
      await remover.mutateAsync(cliente.id);
      toast.success("Cliente excluída.");
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
          Nova cliente
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
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as Ordenacao)}>
          <SelectTrigger className="w-52" aria-label="Ordenar clientes">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A–Z)</SelectItem>
            <SelectItem value="recentes">Cadastro mais recente</SelectItem>
            <SelectItem value="nascimento">Aniversário</SelectItem>
          </SelectContent>
        </Select>
      </DataToolbar>

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={(grupoId, valor) => {
          filtragem.alternar(grupoId, valor);
          setPagina(1);
        }}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        colunas={3}
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtrados.length} cliente(s) encontrada(s)
          </span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhuma cliente encontrada"
          descricao="Ajuste a busca e os filtros ou cadastre a primeira cliente da loja."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Nova cliente
            </Button>
          }
        />
      ) : (
        <PessoaGrid>
          {visiveis.map((cliente) => (
            <PessoaCard
              key={cliente.id}
              nome={cliente.nome}
              foto={cliente.foto}
              ativo={cliente.ativo}
              subtitulo={`Cliente desde ${formatarData(cliente.criadoEm)}`}
              campos={[
                { icon: Phone, label: "Telefone", valor: cliente.telefone },
                {
                  icon: CalendarHeart,
                  label: "Nascimento",
                  valor: formatarData(cliente.dataNascimento),
                },
              ]}
              observacao={cliente.observacao}
              onVisualizar={() => setDetalhe(cliente)}
              acoes={[
                {
                  label: "Editar",
                  icon: Pencil,
                  onClick: () => {
                    setEmEdicao(cliente);
                    setDialogAberto(true);
                  },
                },
                {
                  label: cliente.ativo ? "Inativar" : "Ativar",
                  icon: Power,
                  onClick: () => void alternarStatus(cliente),
                },
                {
                  label: "Excluir",
                  icon: Trash2,
                  destrutivo: true,
                  separarAntes: true,
                  onClick: () => setParaExcluir(cliente),
                },
              ]}
            />
          ))}
        </PessoaGrid>
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
          paraExcluir
            ? `"${paraExcluir.nome}" será removida da base de clientes. Esta ação não pode ser desfeita.`
            : ""
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
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-3xl">{detalhe?.nome}</SheetTitle>
            <SheetDescription>Ficha da cliente e histórico de relacionamento.</SheetDescription>
          </SheetHeader>

          {detalhe ? (
            <div className="space-y-6 px-4 pb-6">
              <div className="flex items-center gap-4">
                <AvatarPessoa nome={detalhe.nome} foto={detalhe.foto} className="size-16" />
                <AtivoBadge ativo={detalhe.ativo} />
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd>{detalhe.telefone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nascimento</dt>
                  <dd>{formatarData(detalhe.dataNascimento)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Cadastro</dt>
                  <dd>{formatarData(detalhe.criadoEm)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Observação</dt>
                  <dd className="max-w-[60%] text-right">{detalhe.observacao || "—"}</dd>
                </div>
              </dl>

              <div>
                <p className="text-eyebrow mb-3">Histórico de compras</p>
                <NotaDemonstracao>
                  O histórico de vendas será exibido aqui quando o módulo de Vendas do PDV estiver
                  integrado à API.
                </NotaDemonstracao>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
