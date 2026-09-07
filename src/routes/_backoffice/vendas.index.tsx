import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeDollarSign, Ban, Clock3, Receipt, TicketPercent } from "lucide-react";
import { Page } from "@/components/layout/page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataToolbar, NotaDemonstracao, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Metrica } from "@/components/dashboard/metrica";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import {
  opcoesDe,
  opcoesDeValores,
  type GrupoFacetaDef,
  type SelecaoFacetas,
} from "@/lib/filtros/facetas";
import { VendaCard, VendasGrid, VendasGridSkeleton } from "@/components/vendas/venda-card";
import { useEstatisticasVendas, useVendas } from "@/hooks/use-vendas";
import { useVendedores } from "@/hooks/use-vendedores";
import { LIMITE_MAXIMO_VENDEDORES } from "@/services/api/vendedores.api";
import { useClientes } from "@/hooks/use-cadastros";
import { LIMITE_MAXIMO_CLIENTES } from "@/services/api/cadastros.api";
import {
  LABEL_STATUS_VENDA,
  STATUS_VENDA,
  type VendaFiltros,
  type VendaResumo,
} from "@/types/venda";
import {
  FAIXAS_VALOR_VENDA,
  OPCOES_ORDENACAO_VENDA,
  OPCOES_PERIODO_VENDA,
  paraOrdenarPorEOrdem,
  vendaNaFaixa,
  vendaNoPeriodo,
  type OrdenacaoVenda,
} from "@/utils/venda";

export const Route = createFileRoute("/_backoffice/vendas/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vendas — MARIELA Backoffice" },
      {
        name: "description",
        content:
          "Consulta administrativa das vendas: faturamento, pagamentos pendentes, descontos e cancelamentos.",
      },
      { property: "og:title", content: "Vendas — MARIELA Backoffice" },
      {
        property: "og:description",
        content:
          "Consulta administrativa das vendas: faturamento, pagamentos pendentes, descontos e cancelamentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendasPage,
});

const POR_PAGINA = 12;

function VendasPage() {
  const { data: estatisticas } = useEstatisticasVendas();
  // Precisa da base inteira para os filtros "Vendedor"/"Cliente" listarem todo
  // mundo, não só uma página — mesma limitação documentada em Produtos: acima
  // de `LIMITE_MAXIMO_VENDEDORES`/`LIMITE_MAXIMO_CLIENTES` (100) registros
  // reais, nem todos apareceriam aqui. Corrigir isso de verdade exige um
  // endpoint dedicado (fora do escopo desta etapa).
  const { data: vendedoresData } = useVendedores({ page: 1, limit: LIMITE_MAXIMO_VENDEDORES });
  const vendedores = vendedoresData?.vendedores;
  const { data: clientesData } = useClientes({ page: 1, limit: LIMITE_MAXIMO_CLIENTES });
  const clientes = clientesData?.clientes;

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoVenda>("data-desc");
  const [pagina, setPagina] = useState(1);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Clientes/Fornecedores/Coleções/Campanhas/Vendedores/Caixa.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criteriosFiltro = useMemo(
    () => ({ busca: busca || undefined, facetas: selecao, ...paraOrdenarPorEOrdem(ordem) }),
    [busca, selecao, ordem],
  );

  useEffect(() => {
    setPagina(1);
  }, [criteriosFiltro]);

  const filtros = useMemo<VendaFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useVendas(filtros);
  const vendas = useMemo(() => data?.vendas ?? [], [data?.vendas]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  const grupos = useMemo<GrupoFacetaDef<VendaResumo>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: STATUS_VENDA.map((status) => ({
          valor: status,
          label: LABEL_STATUS_VENDA[status],
        })),
        corresponde: (venda, valor) => venda.status === valor,
      },
      {
        id: "periodo",
        label: "Período",
        opcoes: OPCOES_PERIODO_VENDA.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        corresponde: (venda, valor) =>
          vendaNoPeriodo(venda, valor as (typeof OPCOES_PERIODO_VENDA)[number]["valor"]),
      },
      {
        id: "vendedor",
        label: "Vendedor",
        opcoes: opcoesDe(vendedores),
        buscavel: true,
        placeholderBusca: "Buscar vendedor…",
        corresponde: (venda, valor) => venda.vendedorId === valor,
      },
      {
        id: "cliente",
        label: "Cliente",
        opcoes: [{ valor: "consumidor-final", label: "Consumidor final" }, ...opcoesDe(clientes)],
        buscavel: true,
        placeholderBusca: "Buscar cliente…",
        corresponde: (venda, valor) =>
          valor === "consumidor-final" ? venda.clienteId === null : venda.clienteId === valor,
      },
      {
        id: "pagamento",
        label: "Forma de pagamento",
        // Valores dinâmicos: vêm do `facets` do próprio backend.
        opcoes: opcoesDeValores((data?.facets["pagamento"] ?? []).map((opcao) => opcao.valor)),
        corresponde: (venda, valor) => venda.formaPagamento === valor,
      },
      {
        id: "caixa",
        label: "Caixa",
        opcoes: opcoesDeValores((data?.facets["caixa"] ?? []).map((opcao) => opcao.valor)),
        corresponde: (venda, valor) => venda.caixaCodigo === valor,
      },
      {
        id: "valor",
        label: "Faixa de valor",
        opcoes: FAIXAS_VALOR_VENDA.map((faixa) => ({ valor: faixa.valor, label: faixa.label })),
        corresponde: (venda, valor) => vendaNaFaixa(venda, valor),
      },
      {
        id: "condicoes",
        label: "Promoção e desconto",
        opcoes: [
          { valor: "promocao", label: "Com promoção" },
          { valor: "desconto", label: "Com desconto do operador" },
          { valor: "cheio", label: "Preço cheio" },
        ],
        corresponde: (venda, valor) =>
          valor === "promocao"
            ? venda.temPromocao
            : valor === "desconto"
              ? venda.temDesconto
              : !venda.temPromocao && !venda.temDesconto,
      },
      {
        id: "financeiro",
        label: "Pagamento",
        opcoes: [
          { valor: "quitada", label: "Quitada" },
          { valor: "pendente", label: "Com valor pendente" },
          { valor: "parcelada", label: "Parcelada" },
          { valor: "devolucao", label: "Com devolução" },
        ],
        corresponde: (venda, valor) =>
          valor === "quitada"
            ? venda.valorPendente === 0
            : valor === "pendente"
              ? venda.valorPendente > 0
              : valor === "parcelada"
                ? venda.totalParcelas > 1
                : venda.valorDevolvido > 0,
      },
    ],
    [vendedores, clientes, data?.facets],
  );

  const filtragem = useFiltrosFacetados({
    itens: vendas,
    grupos,
    facetasExternas: data?.facets,
    selecao,
    onSelecaoChange: setSelecao,
  });

  function limparFiltros() {
    setBusca("");
    filtragem.limparTudo();
  }

  return (
    <Page
      titulo="Vendas"
      breadcrumbs={[{ label: "Operação" }, { label: "Vendas" }]}
      descricao="Consulta e administração das vendas registradas no MARIELA PDV. As vendas são imutáveis: correções acontecem por cancelamento ou devolução."
    >
      <NotaDemonstracao>
        As vendas são criadas no <strong>MARIELA PDV</strong>. Aqui o backoffice apenas consulta,
        baixa parcelas e registra cancelamentos/devoluções — os dados exibidos são de demonstração.
      </NotaDemonstracao>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metrica
          rotulo="Faturamento"
          valor={estatisticas?.faturamento ?? 0}
          tipo="valor"
          icone={BadgeDollarSign}
          destaque
          detalhe={`${estatisticas?.totalVendas ?? 0} venda(s) no período total`}
        />
        <Metrica
          rotulo="Ticket médio"
          valor={estatisticas?.ticketMedio ?? 0}
          tipo="valor"
          icone={Receipt}
          detalhe={`${estatisticas?.itensVendidos ?? 0} peça(s) vendida(s)`}
        />
        <Metrica
          rotulo="Em pagamento"
          valor={estatisticas?.vendasEmPagamento ?? 0}
          tipo="quantidade"
          unidade="venda(s)"
          icone={Clock3}
          detalhe={`Em aberto: ${(estatisticas?.valorEmAberto ?? 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}`}
        />
        <Metrica
          rotulo="Canceladas"
          valor={estatisticas?.vendasCanceladas ?? 0}
          tipo="quantidade"
          unidade="venda(s)"
          icone={Ban}
          detalhe={`Valor cancelado: ${(estatisticas?.valorCancelado ?? 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}`}
        />
        <Metrica
          rotulo="Desconto concedido"
          valor={estatisticas?.descontoConcedido ?? 0}
          tipo="valor"
          icone={TicketPercent}
          detalhe="Promoções e descontos do operador"
        />
      </div>

      <DataToolbar
        busca={busca}
        onBuscaChange={setBusca}
        placeholder="Buscar por código, cliente, vendedor ou pagamento…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoVenda)}>
          <SelectTrigger className="w-60" aria-label="Ordenar vendas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCOES_ORDENACAO_VENDA.map((opcao) => (
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
          <span className="text-sm text-muted-foreground">{total} venda(s) encontrada(s)</span>
        }
      />

      {isPending ? (
        <VendasGridSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhuma venda encontrada"
          descricao="Ajuste a busca e os filtros para localizar as vendas registradas no PDV."
        />
      ) : (
        <VendasGrid>
          {vendas.map((venda) => (
            <VendaCard key={venda.id} venda={venda} />
          ))}
        </VendasGrid>
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
        rotulo="venda(s)"
        onPaginaChange={setPagina}
      />
    </Page>
  );
}
