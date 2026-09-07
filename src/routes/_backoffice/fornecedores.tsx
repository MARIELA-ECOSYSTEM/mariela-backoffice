import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  History,
  Instagram,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
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
import { CodigoBadge } from "@/components/common/codigo-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  FORNECEDOR_VALORES_PADRAO,
  FornecedorDialog,
  type FornecedorFormValues,
} from "@/components/cadastros/fornecedor-dialog";
import { FornecedorHistoricoDialog } from "@/components/cadastros/fornecedor-historico-dialog";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import {
  DialogMensagemWhatsapp,
  type AlvoMensagemWhatsapp,
} from "@/components/cadastros/dialog-mensagem-whatsapp";
import {
  useAtualizarFornecedor,
  useCriarFornecedor,
  useFornecedores,
  useRemoverFornecedor,
} from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarMoeda } from "@/utils/format";
import { formatarTelefone, normalizarTelefone } from "@/utils/cliente";
import {
  ENDERECO_VAZIO,
  OPCOES_FAIXA_PRODUTOS,
  OPCOES_ORDENACAO_FORNECEDOR,
  cidadeUf,
  naFaixaDeProdutos,
  temEndereco,
  ultimaEntradaDentroDe,
  type OrdenacaoFornecedor,
} from "@/utils/fornecedor";
import type {
  Fornecedor,
  FornecedorFiltros,
  OrdenarFornecedorPor,
  Ordem,
} from "@/types/fornecedor";

export const Route = createFileRoute("/_backoffice/fornecedores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fornecedores — MARIELA Backoffice" },
      {
        name: "description",
        content: "Parceiros de produção com indicadores de produtos vinculados e valor em custo.",
      },
      { property: "og:title", content: "Fornecedores — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Parceiros de produção com indicadores de produtos vinculados e valor em custo.",
      },
    ],
  }),
  component: FornecedoresPage,
});

const POR_PAGINA = 12;

/** Mapa "opção do Select" → parâmetros reais de ordenação da API (`ordenarPor`/`ordem`). */
const CAMPO_ORDENACAO: Record<OrdenacaoFornecedor, { campo: OrdenarFornecedorPor; ordem: Ordem }> =
  {
    "nome-asc": { campo: "nome", ordem: "asc" },
    "nome-desc": { campo: "nome", ordem: "desc" },
    "produtos-desc": { campo: "produtosVinculados", ordem: "desc" },
    "custo-desc": { campo: "valorEmCusto", ordem: "desc" },
    "entrada-recente": { campo: "ultimaEntrada", ordem: "desc" },
    "parceiro-antigo": { campo: "criadoEm", ordem: "asc" },
  };

function FornecedoresPage() {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoFornecedor>("nome-asc");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Fornecedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Fornecedor | null>(null);
  const [historico, setHistorico] = useState<Fornecedor | null>(null);
  const [alvoMensagem, setAlvoMensagem] = useState<AlvoMensagemWhatsapp | null>(null);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Produtos/Clientes.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criar = useCriarFornecedor();
  const atualizar = useAtualizarFornecedor();
  const remover = useRemoverFornecedor();

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

  const filtros = useMemo<FornecedorFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useFornecedores(filtros);
  const fornecedores = useMemo(() => data?.fornecedores ?? [], [data?.fornecedores]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  // A página pedida pode ficar fora do intervalo depois que o conjunto de
  // resultados muda de tamanho (ex.: um fornecedor foi excluído e a página 5
  // deixou de existir) — corrige para a última página válida em vez de
  // deixar "página 5 de 3" na tela.
  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  const grupos = useMemo<GrupoFacetaDef<Fornecedor>[]>(
    () => [
      {
        id: "produtos",
        label: "Produtos vinculados",
        opcoes: OPCOES_FAIXA_PRODUTOS.map((opcao) => ({
          valor: opcao.valor,
          label: opcao.label,
        })),
        corresponde: (fornecedor, valor) => naFaixaDeProdutos(fornecedor.produtosVinculados, valor),
      },
      {
        id: "endereco",
        label: "Endereço",
        opcoes: [
          { valor: "com", label: "Com endereço" },
          { valor: "sem", label: "Sem endereço" },
        ],
        corresponde: (fornecedor, valor) =>
          valor === "com" ? temEndereco(fornecedor) : !temEndereco(fornecedor),
      },
      {
        id: "entrada",
        label: "Última entrada",
        opcoes: [
          { valor: "30", label: "Últimos 30 dias" },
          { valor: "90", label: "Últimos 90 dias" },
          { valor: "nunca", label: "Sem entradas" },
        ],
        corresponde: (fornecedor, valor) =>
          valor === "nunca"
            ? !fornecedor.ultimaEntrada
            : ultimaEntradaDentroDe(fornecedor, Number(valor)),
      },
      {
        id: "documento",
        label: "Documento",
        opcoes: [
          { valor: "com", label: "Com CNPJ" },
          { valor: "sem", label: "Sem CNPJ" },
        ],
        corresponde: (fornecedor, valor) =>
          valor === "com" ? Boolean(fornecedor.cnpj) : !fornecedor.cnpj,
      },
    ],
    [],
  );

  const filtragem = useFiltrosFacetados({
    itens: fornecedores,
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

  const valoresIniciais: FornecedorFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
        contato: emEdicao.contato,
        telefone: formatarTelefone(emEdicao.telefone),
        email: emEdicao.email,
        cnpj: emEdicao.cnpj,
        instagram: emEdicao.instagram,
        observacao: emEdicao.observacao,
        ...(emEdicao.endereco ?? ENDERECO_VAZIO),
      }
    : FORNECEDOR_VALORES_PADRAO;

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: FornecedorFormValues) {
    const endereco = {
      cep: valores.cep,
      logradouro: valores.logradouro,
      numero: valores.numero,
      complemento: valores.complemento,
      bairro: valores.bairro,
      cidade: valores.cidade,
      estado: valores.estado.toUpperCase(),
    };
    const payload = {
      nome: valores.nome,
      foto: valores.foto || null,
      contato: valores.contato,
      telefone: normalizarTelefone(valores.telefone),
      email: valores.email,
      cnpj: valores.cnpj,
      instagram: valores.instagram,
      observacao: valores.observacao,
      // Endereço opcional: a API descarta o objeto quando todos os campos estão vazios.
      endereco: Object.values(endereco).some((campo) => campo.trim()) ? endereco : null,
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o fornecedor."));
    }
  }

  async function excluir(fornecedor: Fornecedor) {
    try {
      await remover.mutateAsync(fornecedor.id);
      toast.success("Fornecedor excluído.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o fornecedor."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Fornecedores"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Fornecedores" }]}
      descricao="Parceiros de produção com produtos vinculados, valor em custo e histórico."
      acoes={
        <Button onClick={abrirNovo}>
          <Plus aria-hidden className="size-4" />
          Novo fornecedor
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={setBusca}
        placeholder="Buscar por nome, código, contato, telefone ou CNPJ…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoFornecedor)}>
          <SelectTrigger className="w-64" aria-label="Ordenar fornecedores">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCOES_ORDENACAO_FORNECEDOR.map((opcao) => (
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
          <span className="text-sm text-muted-foreground">
            {total} fornecedor(es) encontrado(s)
          </span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhum fornecedor encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre o primeiro parceiro da loja."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={abrirNovo}>
                <Plus aria-hidden className="size-4" />
                Novo fornecedor
              </Button>
            )
          }
        />
      ) : (
        <PessoaGrid>
          {fornecedores.map((fornecedor) => (
            <PessoaCard
              key={fornecedor.id}
              nome={fornecedor.nome}
              foto={fornecedor.foto}
              subtitulo={
                fornecedor.contato
                  ? `Contato: ${fornecedor.contato}`
                  : "Sem contato responsável informado"
              }
              badgeExtra={<CodigoBadge codigo={fornecedor.codigo} />}
              // Campos vazios são omitidos para o card não virar uma coluna de "—".
              campos={[
                { icon: Building2, label: "CNPJ", valor: fornecedor.cnpj },
                { icon: Phone, label: "Telefone", valor: formatarTelefone(fornecedor.telefone) },
                { icon: Mail, label: "E-mail", valor: fornecedor.email },
                { icon: MapPin, label: "Cidade/UF", valor: cidadeUf(fornecedor.endereco) },
                { icon: Instagram, label: "Instagram", valor: fornecedor.instagram },
                {
                  icon: CalendarDays,
                  label: "Parceria desde",
                  valor: `Parceria desde ${formatarData(fornecedor.criadoEm)}`,
                },
              ].filter((campo) => campo.valor.trim().length > 0)}
              metricas={[
                { label: "Produtos", valor: String(fornecedor.produtosVinculados) },
                {
                  label: "Valor em custo",
                  valor: formatarMoeda(fornecedor.valorEmCusto),
                  destaque: true,
                },
                {
                  label: "Última entrada",
                  valor: fornecedor.ultimaEntrada ? formatarData(fornecedor.ultimaEntrada) : "—",
                },
              ]}
              observacao={fornecedor.observacao}
              acaoRapida={
                <BotaoWhatsapp
                  nome={fornecedor.nome}
                  numero={fornecedor.telefone}
                  onClick={() =>
                    setAlvoMensagem({
                      id: fornecedor.id,
                      nome: fornecedor.nome,
                      telefone: fornecedor.telefone,
                      tipoMensagem: "fornecedor",
                      papel: "Fornecedor",
                    })
                  }
                />
              }
              onVisualizar={() => setHistorico(fornecedor)}
              acoes={[
                {
                  label: "Ver histórico",
                  icon: History,
                  onClick: () => setHistorico(fornecedor),
                },
                {
                  label: "Editar",
                  icon: Pencil,
                  onClick: () => {
                    setEmEdicao(fornecedor);
                    setDialogAberto(true);
                  },
                },
                {
                  label: "Excluir",
                  icon: Trash2,
                  destrutivo: true,
                  separarAntes: true,
                  onClick: () => setParaExcluir(fornecedor),
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
        rotulo="fornecedor(es)"
        onPaginaChange={setPagina}
      />

      <FornecedorDialog
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

      <FornecedorHistoricoDialog
        fornecedor={historico}
        onOpenChange={(aberto) => {
          if (!aberto) setHistorico(null);
        }}
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
        titulo="Excluir fornecedor"
        descricao={
          paraExcluir
            ? `"${paraExcluir.nome}" será removido. Fornecedores com produtos vinculados não podem ser excluídos.`
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
