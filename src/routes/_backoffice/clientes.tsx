import { useEffect, useMemo, useState } from "react";
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
import { DataToolbar, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import type { GrupoFacetaDef, SelecaoFacetas } from "@/lib/filtros/facetas";
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
import { LIMITE_MAXIMO_CLIENTES } from "@/services/api/cadastros.api";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarMoeda } from "@/utils/format";
import {
  OPCOES_ORDENACAO,
  aniversarioNoPeriodo,
  formatarTelefone,
  numeroWhatsapp,
  rotuloUltimaCompra,
  semCompraDesde,
  janelaSemCompra,
  type OrdenacaoCliente,
} from "@/utils/cliente";
import type { Cliente, ClienteFiltros, OrdenarClientePor, Ordem } from "@/types/cliente";

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

/** Mapa "opção do Select" → parâmetros reais de ordenação da API (`ordenarPor`/`ordem`). */
const CAMPO_ORDENACAO: Record<OrdenacaoCliente, { campo: OrdenarClientePor; ordem: Ordem }> = {
  "nome-asc": { campo: "nome", ordem: "asc" },
  "nome-desc": { campo: "nome", ordem: "desc" },
  "compras-desc": { campo: "compras", ordem: "desc" },
  "compras-asc": { campo: "compras", ordem: "asc" },
  "valor-desc": { campo: "totalComprado", ordem: "desc" },
  "valor-asc": { campo: "totalComprado", ordem: "asc" },
  "compra-recente": { campo: "ultimaCompra", ordem: "desc" },
  "compra-antiga": { campo: "ultimaCompra", ordem: "asc" },
  "sem-compra": { campo: "ultimaCompra", ordem: "asc" },
};

function ClientesPage() {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoCliente>("nome-asc");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [aniversariantesAberto, setAniversariantesAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [alvoMensagem, setAlvoMensagem] = useState<AlvoMensagemWhatsapp | null>(null);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Produtos.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criar = useCriarCliente();
  const atualizar = useAtualizarCliente();
  const remover = useRemoverCliente();

  // Tudo que, ao mudar, invalida o conjunto de resultados (portanto exige
  // voltar para a página 1) — deliberadamente SEM `pagina`/`limit` aqui, para
  // o efeito abaixo não entrar em looping consigo mesmo a cada troca de página.
  const criteriosFiltro = useMemo(() => {
    const opcao = CAMPO_ORDENACAO[ordem];
    return {
      busca: busca || undefined,
      ordenarPor: opcao.campo,
      ordem: opcao.ordem,
      facetas: selecao,
    };
  }, [busca, ordem, selecao]);

  // Busca, ordenação ou facetas mudaram: o conjunto de resultados é outro,
  // então a paginação sempre recomeça em 1.
  useEffect(() => {
    setPagina(1);
  }, [criteriosFiltro]);

  const filtros = useMemo<ClienteFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useClientes(filtros);
  const clientes = useMemo(() => data?.clientes ?? [], [data?.clientes]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  // A página pedida pode ficar fora do intervalo depois que o conjunto de
  // resultados muda de tamanho (ex.: uma cliente foi excluída e a página 5
  // deixou de existir) — corrige para a última página válida em vez de
  // deixar "página 5 de 3" na tela.
  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  // O diálogo de Aniversariantes precisa da base INTEIRA (não a página
  // atual) para achatar aniversariantes de qualquer cliente — só dispara
  // quando o diálogo abre, com o maior `limit` que o backend aceita. Acima
  // de `LIMITE_MAXIMO_CLIENTES` clientes reais, nem todos apareceriam aqui;
  // a correção definitiva seria um endpoint dedicado (fora do escopo desta etapa).
  const { data: baseCompleta } = useClientes(
    { page: 1, limit: LIMITE_MAXIMO_CLIENTES },
    { enabled: aniversariantesAberto },
  );

  const grupos = useMemo<GrupoFacetaDef<Cliente>[]>(
    () => [
      {
        id: "recencia",
        label: "Sem compra recente",
        opcoes: [
          { valor: "1m", label: "Mais de 1 mês sem comprar" },
          { valor: "3m", label: "Mais de 3 meses sem comprar" },
          { valor: "6m", label: "Mais de 6 meses sem comprar" },
        ],
        corresponde: (cliente, valor) => semCompraDesde(cliente, janelaSemCompra(valor)),
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

  const filtragem = useFiltrosFacetados({
    itens: clientes,
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
      <DataToolbar
        busca={busca}
        onBuscaChange={setBusca}
        placeholder="Buscar por nome ou telefone…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoCliente)}>
          <SelectTrigger className="w-60" aria-label="Ordenar clientes">
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
      </DataToolbar>

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={limparFiltros}
        resultado={
          <span className="text-sm text-muted-foreground">{total} cliente(s) encontrada(s)</span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhuma cliente encontrada"
          descricao="Ajuste a busca e os filtros ou cadastre a primeira cliente da loja."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={abrirNovo}>
                <Plus aria-hidden className="size-4" />
                Nova cliente
              </Button>
            )
          }
        />
      ) : (
        <PessoaGrid>
          {clientes.map((cliente) => (
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

      {total > 0 ? (
        <div className="mt-7 flex items-center justify-end">
          {isFetching ? <span className="text-xs text-muted-foreground">Atualizando…</span> : null}
        </div>
      ) : null}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={total}
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
        onSubmit={(valores) => void salvar(valores)}
      />

      <AniversariantesDialog
        open={aniversariantesAberto}
        onOpenChange={setAniversariantesAberto}
        clientes={baseCompleta?.clientes ?? []}
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
        onConfirm={() => {
          if (paraExcluir) void excluir(paraExcluir);
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
