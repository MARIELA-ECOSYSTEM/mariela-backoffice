import { useMemo, useState } from "react";
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
import { BuscaInput, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import type { GrupoFacetaDef } from "@/lib/filtros/facetas";
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
  ordenarFornecedores,
  temEndereco,
  ultimaEntradaDentroDe,
  type OrdenacaoFornecedor,
} from "@/utils/fornecedor";
import type { Fornecedor } from "@/types/fornecedor";

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

function FornecedoresPage() {
  const { data: fornecedores, isPending, isError, error, refetch } = useFornecedores();
  const criar = useCriarFornecedor();
  const atualizar = useAtualizarFornecedor();
  const remover = useRemoverFornecedor();

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoFornecedor>("nome-asc");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Fornecedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Fornecedor | null>(null);
  const [historico, setHistorico] = useState<Fornecedor | null>(null);
  const [alvoMensagem, setAlvoMensagem] = useState<AlvoMensagemWhatsapp | null>(null);

  const grupos = useMemo<GrupoFacetaDef<Fornecedor>[]>(
    () => [
      {
        id: "produtos",
        label: "Produtos vinculados",
        opcoes: OPCOES_FAIXA_PRODUTOS.map((opcao) => ({
          valor: opcao.valor,
          label: opcao.label,
        })),
        corresponde: (fornecedor, valor) =>
          naFaixaDeProdutos(fornecedor.produtosVinculados, valor),
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

  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (fornecedores ?? []).filter(
      (fornecedor) =>
        !termo ||
        fornecedor.nome.toLowerCase().includes(termo) ||
        fornecedor.codigo.toLowerCase().includes(termo) ||
        fornecedor.contato.toLowerCase().includes(termo) ||
        fornecedor.telefone.toLowerCase().includes(termo) ||
        fornecedor.cnpj.toLowerCase().includes(termo),
    );
  }, [fornecedores, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscados, grupos });
  const filtrados = useMemo(
    () => ordenarFornecedores(filtragem.itensFiltrados, ordem),
    [filtragem.itensFiltrados, ordem],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

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
      throw err;
    }
  }

  async function excluir(fornecedor: Fornecedor) {
    try {
      await remover.mutateAsync(fornecedor.id);
      toast.success("Fornecedor excluído.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o fornecedor."));
      throw err;
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
              placeholder="Buscar por nome, código, contato, telefone ou CNPJ…"
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
              <Select
                value={ordem}
                onValueChange={(valor) => setOrdem(valor as OrdenacaoFornecedor)}
              >
                <SelectTrigger className="h-10 w-64" aria-label="Ordenar fornecedores">
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
            </div>
          </div>
        }
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtrados.length} fornecedor(es) encontrado(s)
          </span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum fornecedor encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre o primeiro parceiro da loja."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Novo fornecedor
            </Button>
          }
        />
      ) : (
        <PessoaGrid>
          {visiveis.map((fornecedor) => (
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

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={filtrados.length}
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
        onSubmit={salvar}
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
        onConfirm={async () => {
          if (paraExcluir) await excluir(paraExcluir);
        }}
      />
    </Page>
  );
}
