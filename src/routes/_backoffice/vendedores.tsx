import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, KeyRound, Pencil, Phone, Plus, Power, Trash2 } from "lucide-react";
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
  VENDEDOR_VALORES_PADRAO,
  VendedorDialog,
  type VendedorFormValues,
} from "@/components/cadastros/vendedor-dialog";
import { SenhaDialog, type SenhaFormValues } from "@/components/cadastros/senha-dialog";
import {
  useAlterarStatusVendedor,
  useAtualizarVendedor,
  useCriarVendedor,
  useRedefinirSenhaVendedor,
  useRemoverVendedor,
  useVendedores,
} from "@/hooks/use-vendedores";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData } from "@/utils/format";
import type { Vendedor, VendedorPayload } from "@/types/vendedor";

export const Route = createFileRoute("/_backoffice/vendedores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vendedores — MARIELA Backoffice" },
      {
        name: "description",
        content: "Gerenciamento dos vendedores que utilizam o MARIELA PDV.",
      },
      { property: "og:title", content: "Vendedores — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Gerenciamento dos vendedores que utilizam o MARIELA PDV.",
      },
    ],
  }),
  component: VendedoresPage,
});

const POR_PAGINA = 12;

type Ordenacao = "nome" | "recentes";

function VendedoresPage() {
  const { data: vendedores, isPending, isError, error, refetch } = useVendedores();
  const criar = useCriarVendedor();
  const atualizar = useAtualizarVendedor();
  const alterarStatus = useAlterarStatusVendedor();
  const redefinirSenha = useRedefinirSenhaVendedor();
  const remover = useRemoverVendedor();

  const [busca, setBusca] = useState("");

  const [ordem, setOrdem] = useState<Ordenacao>("nome");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Vendedor | null>(null);
  const [paraSenha, setParaSenha] = useState<Vendedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Vendedor | null>(null);
  const [detalhe, setDetalhe] = useState<Vendedor | null>(null);

  const grupos = useMemo<GrupoFacetaDef<Vendedor>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (vendedor, valor) => (valor === "ativos" ? vendedor.ativo : !vendedor.ativo),
      },
      {
        id: "nascimento",
        label: "Aniversário",
        opcoes: [
          { valor: "com", label: "Com data cadastrada" },
          { valor: "sem", label: "Sem data cadastrada" },
        ],
        corresponde: (vendedor, valor) =>
          valor === "com" ? Boolean(vendedor.dataNascimento) : !vendedor.dataNascimento,
      },
      {
        id: "observacao",
        label: "Observação",
        opcoes: [
          { valor: "com", label: "Com observação" },
          { valor: "sem", label: "Sem observação" },
        ],
        corresponde: (vendedor, valor) =>
          valor === "com" ? Boolean(vendedor.observacao) : !vendedor.observacao,
      },
    ],
    [],
  );

  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (vendedores ?? []).filter(
      (vendedor) =>
        !termo ||
        vendedor.nome.toLowerCase().includes(termo) ||
        vendedor.telefone.toLowerCase().includes(termo),
    );
  }, [vendedores, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscados, grupos });

  const filtrados = useMemo(() => {
    const copia = [...filtragem.itensFiltrados];
    return ordem === "nome"
      ? copia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      : copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }, [filtragem.itensFiltrados, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: VendedorFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
        telefone: emEdicao.telefone,
        dataNascimento: emEdicao.dataNascimento ?? "",
        observacao: emEdicao.observacao,
        senha: "",
        confirmacaoSenha: "",
        ativo: emEdicao.ativo,
      }
    : VENDEDOR_VALORES_PADRAO;

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: VendedorFormValues) {
    const payload: VendedorPayload = {
      nome: valores.nome,
      foto: valores.foto || null,
      telefone: valores.telefone,
      dataNascimento: valores.dataNascimento || null,
      observacao: valores.observacao,
      ativo: valores.ativo,
      ...(valores.senha ? { senha: valores.senha } : {}),
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Vendedor(a) atualizado(a)." : "Vendedor(a) cadastrado(a).");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o vendedor."));
    }
  }

  async function alternarStatus(vendedor: Vendedor) {
    try {
      await alterarStatus.mutateAsync({ id: vendedor.id, ativo: !vendedor.ativo });
      toast.success(vendedor.ativo ? "Acesso ao PDV suspenso." : "Acesso ao PDV liberado.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
    }
  }

  async function salvarSenha(valores: SenhaFormValues) {
    if (!paraSenha) return;
    try {
      await redefinirSenha.mutateAsync({ id: paraSenha.id, senha: valores.senha });
      toast.success("Senha redefinida.");
      setParaSenha(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível redefinir a senha."));
    }
  }

  async function excluir(vendedor: Vendedor) {
    try {
      await remover.mutateAsync(vendedor.id);
      toast.success("Vendedor(a) excluído(a).");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o vendedor."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Vendedores"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Vendedores" }]}
      descricao="Usuários do MARIELA PDV. O backoffice é exclusivo da administração — vendedores não acessam esta área."
      acoes={
        <Button onClick={abrirNovo}>
          <Plus aria-hidden className="size-4" />
          Novo vendedor
        </Button>
      }
    >
      <NotaDemonstracao>
        As senhas são enviadas à API para geração do hash. O backoffice nunca exibe nem armazena
        senhas.
      </NotaDemonstracao>

      <DataToolbar
        busca={busca}
        onBuscaChange={(valor) => {
          setBusca(valor);
          setPagina(1);
        }}
        placeholder="Buscar por nome ou telefone…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as Ordenacao)}>
          <SelectTrigger className="w-52" aria-label="Ordenar vendedores">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A–Z)</SelectItem>
            <SelectItem value="recentes">Cadastro mais recente</SelectItem>
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
            {filtrados.length} vendedor(as) encontrada(s)
          </span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum vendedor encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre o primeiro usuário do PDV."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Novo vendedor
            </Button>
          }
        />
      ) : (
        <PessoaGrid>
          {visiveis.map((vendedor) => (
            <PessoaCard
              key={vendedor.id}
              nome={vendedor.nome}
              foto={vendedor.foto}
              ativo={vendedor.ativo}
              subtitulo="Usuário do MARIELA PDV"
              campos={[
                { icon: Phone, label: "Telefone", valor: vendedor.telefone },
                {
                  icon: CalendarDays,
                  label: "Cadastro",
                  valor: `Cadastro em ${formatarData(vendedor.criadoEm)}`,
                },
              ]}
              observacao={vendedor.observacao}
              onVisualizar={() => setDetalhe(vendedor)}
              acoes={[
                {
                  label: "Editar",
                  icon: Pencil,
                  onClick: () => {
                    setEmEdicao(vendedor);
                    setDialogAberto(true);
                  },
                },
                {
                  label: vendedor.ativo ? "Inativar" : "Ativar",
                  icon: Power,
                  onClick: () => void alternarStatus(vendedor),
                },
                {
                  label: "Redefinir senha",
                  icon: KeyRound,
                  onClick: () => setParaSenha(vendedor),
                },
                {
                  label: "Excluir",
                  icon: Trash2,
                  destrutivo: true,
                  separarAntes: true,
                  onClick: () => setParaExcluir(vendedor),
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
        rotulo="vendedor(es)"
        onPaginaChange={setPagina}
      />

      <VendedorDialog
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

      <SenhaDialog
        open={paraSenha !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaSenha(null);
        }}
        nome={paraSenha?.nome ?? ""}
        salvando={redefinirSenha.isPending}
        onSubmit={(valores) => void salvarSenha(valores)}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir vendedor"
        descricao={
          paraExcluir
            ? `"${paraExcluir.nome}" perderá o acesso ao MARIELA PDV. Esta ação não pode ser desfeita.`
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
            <SheetDescription>Dados do vendedor e acesso ao PDV.</SheetDescription>
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
                  <dt className="text-muted-foreground">Atualização</dt>
                  <dd>{formatarData(detalhe.atualizadoEm)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Observação</dt>
                  <dd className="max-w-[60%] text-right">{detalhe.observacao || "—"}</dd>
                </div>
              </dl>

              <Button variant="outline" className="w-full" onClick={() => setParaSenha(detalhe)}>
                <KeyRound aria-hidden className="size-4" />
                Redefinir senha do PDV
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
