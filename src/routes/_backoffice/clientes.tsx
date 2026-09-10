import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Cake, CalendarHeart, Pencil, Phone, Plus, Trash2 } from "lucide-react";
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
import { BuscaInput, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import type { GrupoFacetaDef } from "@/lib/filtros/facetas";
import { GridSkeleton, PessoaCard, PessoaGrid } from "@/components/common/pessoa-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  CLIENTE_VALORES_PADRAO,
  ClienteDialog,
  type ClienteFormValues,
} from "@/components/cadastros/cliente-dialog";
import { AniversariantesDialog } from "@/components/cadastros/aniversariantes-dialog";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import { ClienteDetalhe } from "@/components/cadastros/cliente-detalhe";
import {
  DialogMensagemWhatsapp,
  type AlvoMensagemWhatsapp,
} from "@/components/cadastros/dialog-mensagem-whatsapp";
import {
  useAtualizarCliente,
  useClientes,
  useCriarCliente,
  useRemoverCliente,
} from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarMoeda } from "@/utils/format";
import {
  OPCOES_ORDENACAO,
  OPCOES_SEM_COMPRA,
  aniversarioNoPeriodo,
  formatarTelefone,
  janelaSemCompra,
  numeroWhatsapp,
  ordenarClientes,
  rotuloUltimaCompra,
  semCompraDesde,
  type OrdenacaoCliente,
} from "@/utils/cliente";
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

function ClientesPage() {
  const { data: clientes, isPending, isError, error, refetch } = useClientes();
  const criar = useCriarCliente();
  const atualizar = useAtualizarCliente();
  const remover = useRemoverCliente();

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoCliente>("nome-asc");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [aniversariantesAberto, setAniversariantesAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [alvoMensagem, setAlvoMensagem] = useState<AlvoMensagemWhatsapp | null>(null);

  const grupos = useMemo<GrupoFacetaDef<Cliente>[]>(
    () => [
      {
        id: "recencia",
        label: "Sem compra recente",
        opcoes: [
          { valor: "todos", label: "Todos" },
          ...OPCOES_SEM_COMPRA.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        ],
        // "Todos" não restringe nada: existe para deixar a contagem total visível.
        corresponde: (cliente, valor) =>
          valor === "todos" ? true : semCompraDesde(cliente, janelaSemCompra(valor)),
      },
      {
        id: "historico",
        label: "Histórico",
        opcoes: [
          { valor: "com", label: "Já comprou" },
          { valor: "sem", label: "Nunca comprou" },
          { valor: "recorrente", label: "Recorrente (2+ compras)" },
        ],
        corresponde: (cliente, valor) =>
          valor === "com"
            ? cliente.compras > 0
            : valor === "sem"
              ? cliente.compras === 0
              : cliente.compras >= 2,
      },
      {
        id: "aniversario",
        label: "Aniversário",
        opcoes: [
          { valor: "mes", label: "Neste mês" },
          { valor: "semana", label: "Nesta semana" },
          { valor: "com", label: "Com data cadastrada" },
          { valor: "sem", label: "Sem data cadastrada" },
        ],
        corresponde: (cliente, valor) => {
          if (valor === "com") return Boolean(cliente.dataNascimento);
          if (valor === "sem") return !cliente.dataNascimento;
          return aniversarioNoPeriodo(cliente.dataNascimento, valor === "mes" ? "mes" : "semana");
        },
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
    () => ordenarClientes(filtragem.itensFiltrados, ordem),
    [filtragem.itensFiltrados, ordem],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: ClienteFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
        telefone: formatarTelefone(emEdicao.telefone),
        dataNascimento: emEdicao.dataNascimento ?? "",
        observacao: emEdicao.observacao,
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
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Cliente atualizada." : "Cliente cadastrada.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o cliente."));
      throw err;
    }
  }

  async function excluir(cliente: Cliente) {
    try {
      await remover.mutateAsync(cliente.id);
      toast.success("Cliente excluída.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o cliente."));
      throw err;
    }
  }

  return (
    <Page
      titulo="Clientes"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Clientes" }]}
      descricao="Base de clientes com contato, aniversário e histórico de compras."
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setAniversariantesAberto(true)}>
            <Cake aria-hidden className="size-4" />
            Aniversariantes
          </Button>
          <Button onClick={abrirNovo}>
            <Plus aria-hidden className="size-4" />
            Nova cliente
          </Button>
        </div>
      }
    >
      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={(grupoId, valor) => {
          filtragem.alternar(grupoId, valor);
          setPagina(1);
        }}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        cabecalho={
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <BuscaInput
              valor={busca}
              onValorChange={(valor) => {
                setBusca(valor);
                setPagina(1);
              }}
              placeholder="Buscar por nome ou telefone…"
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
              <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoCliente)}>
                <SelectTrigger className="h-10 w-60" aria-label="Ordenar clientes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPCOES_ORDENACAO.map((opcao) => (
                    <SelectItem key={opcao.valor} value={opcao.valor}>
                      {opcao.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
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
              subtitulo={`Cliente desde ${formatarData(cliente.criadoEm)}`}
              campos={[
                {
                  icon: Phone,
                  label: "Telefone",
                  valor: formatarTelefone(cliente.telefone),
                },
                {
                  icon: CalendarHeart,
                  label: "Nascimento",
                  valor: cliente.dataNascimento ? formatarData(cliente.dataNascimento) : "—",
                },
              ]}
              metricas={[
                { label: "Compras", valor: String(cliente.compras) },
                {
                  label: "Total comprado",
                  valor: formatarMoeda(cliente.totalComprado),
                  destaque: true,
                },
                { label: "Última compra", valor: rotuloUltimaCompra(cliente.ultimaCompra) },
              ]}
              observacao={cliente.observacao}
              acaoRapida={
                <BotaoWhatsapp
                  nome={cliente.nome}
                  numero={numeroWhatsapp(cliente)}
                  onClick={() =>
                    setAlvoMensagem({
                      id: cliente.id,
                      nome: cliente.nome,
                      telefone: cliente.telefone,
                      tipoMensagem: "geral",
                      papel: "Cliente",
                    })
                  }
                />
              }
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
        codigo={emEdicao?.codigo}
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={salvar}
      />

      <AniversariantesDialog
        open={aniversariantesAberto}
        onOpenChange={setAniversariantesAberto}
        clientes={clientes ?? []}
      />

      <DialogMensagemWhatsapp
        alvo={alvoMensagem}
        onOpenChange={(aberto) => {
          if (!aberto) setAlvoMensagem(null);
        }}
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
        onConfirm={async () => {
          if (paraExcluir) await excluir(paraExcluir);
        }}
      />

      <ClienteDetalhe
        cliente={detalhe}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
        onEnviarMensagem={(cliente) =>
          setAlvoMensagem({
            id: cliente.id,
            nome: cliente.nome,
            telefone: cliente.telefone,
            tipoMensagem: "geral",
            papel: "Cliente",
          })
        }
      />
    </Page>
  );
}
