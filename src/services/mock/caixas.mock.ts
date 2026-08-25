import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId } from "./db";
import { proximoCodigo } from "./sequencias";
import {
  caixaAberto,
  calcularResumoCaixa,
  movimentacoesDoCaixa,
  recebimentosDoCaixa,
  registrarMovimentacao,
  sincronizarResumosCaixas,
} from "./caixas.lancamentos";
import { ApiError } from "@/types/api";
import type {
  AberturaCaixaPayload,
  Caixa,
  CaixaDetalhe,
  CaixaEstatisticas,
  EntradaCaixaPayload,
  FechamentoCaixaPayload,
  SaidaCaixaPayload,
} from "@/types/caixa";

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

function encontrar(id: string): Caixa {
  const caixa = db.caixas.find((item) => item.id === id);
  if (!caixa) throw ApiError.notFound("Caixa não encontrado.");
  return caixa;
}

/** Caixa FECHADO é histórico imutável: nenhum lançamento é aceito. */
function exigirAberto(caixa: Caixa): void {
  if (caixa.status === "fechado")
    throw ApiError.validation(
      "Este caixa está fechado e é imutável. Registre o ajuste em um novo caixa.",
    );
}

function detalhar(caixa: Caixa): CaixaDetalhe {
  caixa.resumo = calcularResumoCaixa(caixa);
  const movimentacoes = movimentacoesDoCaixa(caixa.id);
  const vendasIds = new Set(
    movimentacoes.map((item) => item.vendaId).filter((item): item is string => Boolean(item)),
  );
  return {
    ...caixa,
    movimentacoes,
    vendas: db.vendas
      .filter((venda) => venda.caixaId === caixa.id || vendasIds.has(venda.id))
      .sort((a, b) => b.dataVenda.localeCompare(a.dataVenda)),
    recebimentos: recebimentosDoCaixa(caixa),
  };
}

function estatisticas(): CaixaEstatisticas {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const doDia = db.caixasMovimentacoes.filter((item) => {
    const data = new Date(item.dataHora);
    return data >= hoje && data < amanha;
  });
  const somar = (tipos: string[]) =>
    arredondar(
      doDia
        .filter((item) => tipos.includes(item.tipo))
        .reduce((total, item) => total + item.valor, 0),
    );
  const aberto = caixaAberto();

  return {
    caixasAbertos: db.caixas.filter((caixa) => caixa.status === "aberto").length,
    caixasFechados: db.caixas.filter((caixa) => caixa.status === "fechado").length,
    entradasHoje: arredondar(
      doDia
        .filter((item) => item.sentido === "entrada")
        .reduce((total, item) => total + item.valor, 0),
    ),
    saidasHoje: arredondar(
      doDia
        .filter((item) => item.sentido === "saida")
        .reduce((total, item) => total + item.valor, 0),
    ),
    vendasHoje: somar(["venda"]),
    recebimentosHoje: somar(["recebimento_parcela"]),
    devolucoesHoje: somar(["devolucao", "cancelamento"]),
    saldoEsperadoAtual: aberto ? calcularResumoCaixa(aberto).saldoEsperado : 0,
    diferencaAcumulada: arredondar(
      db.caixas.reduce((total, caixa) => total + (caixa.fechamento?.diferenca ?? 0), 0),
    ),
  };
}

function responsavel(id: string | null | undefined): { id: string | null; nome: string } {
  if (!id) return { id: null, nome: "Backoffice" };
  const vendedor = db.vendedores.find((item) => item.id === id);
  if (!vendedor) throw ApiError.notFound("Responsável não encontrado.");
  return { id: vendedor.id, nome: vendedor.nome };
}

function validarMovimento(payload: Partial<SaidaCaixaPayload>, exigirMotivo: boolean): void {
  const erros = [];
  if (!payload.descricao?.trim())
    erros.push({ field: "descricao", message: "Informe a descrição." });
  const valor = Number(payload.valor ?? 0);
  if (!Number.isFinite(valor) || valor <= 0)
    erros.push({ field: "valor", message: "O valor deve ser maior que zero." });
  if (!payload.formaPagamento?.trim())
    erros.push({ field: "formaPagamento", message: "Informe a forma de pagamento." });
  if (exigirMotivo && !payload.motivo?.trim())
    erros.push({ field: "motivo", message: "Informe o motivo da saída." });
  if (erros.length) throw ApiError.validation("Dados inválidos.", erros);
}

export function registerCaixasMocks(): void {
  sincronizarResumosCaixas();

  /** `/caixas/atual` precisa ser registrada ANTES de `/caixas/:id`. */
  registerMock("GET", "/caixas/atual", () => {
    const aberto = caixaAberto();
    return { data: aberto ? clonar(detalhar(aberto)) : null };
  });

  registerMock("GET", "/caixas/estatisticas", () => ({ data: estatisticas() }));

  registerMock("GET", "/caixas", () => {
    sincronizarResumosCaixas();
    const lista = [...db.caixas].sort((a, b) =>
      b.abertura.dataHora.localeCompare(a.abertura.dataHora),
    );
    return { data: clonar(lista), meta: { total: lista.length } };
  });

  registerMock("GET", "/caixas/:id", ({ params }) => ({
    data: clonar(detalhar(encontrar(params["id"]!))),
  }));

  registerMock("GET", "/caixas/:id/movimentacoes", ({ params }) => ({
    data: clonar(movimentacoesDoCaixa(encontrar(params["id"]!).id)),
  }));

  registerMock("GET", "/caixas/:id/vendas", ({ params }) => ({
    data: clonar(detalhar(encontrar(params["id"]!)).vendas),
  }));

  registerMock("GET", "/caixas/:id/recebimentos", ({ params }) => ({
    data: clonar(recebimentosDoCaixa(encontrar(params["id"]!))),
  }));

  /** Abertura: apenas um caixa aberto por vez. */
  registerMock("POST", "/caixas", ({ body }) => {
    if (caixaAberto()) throw ApiError.validation("Já existe um caixa aberto.");

    const payload = (body ?? {}) as Partial<AberturaCaixaPayload>;
    const valorInicial = Number(payload.valorInicial ?? NaN);
    if (!Number.isFinite(valorInicial) || valorInicial < 0)
      throw ApiError.validation("Dados inválidos.", [
        { field: "valorInicial", message: "Informe o valor inicial do caixa." },
      ]);

    const autor = responsavel(payload.responsavelId);
    const caixa: Caixa = {
      id: gerarId("cx"),
      codigo: proximoCodigo("caixa"),
      status: "aberto",
      abertura: {
        dataHora: agora(),
        responsavelId: autor.id,
        responsavelNome: autor.nome,
        valorInicial: arredondar(valorInicial),
        observacao: payload.observacao?.trim() ?? "",
      },
      fechamento: null,
      resumo: {
        valorAbertura: arredondar(valorInicial),
        totalVendas: 0,
        recebimentos: 0,
        entradasManuais: 0,
        totalEntradas: 0,
        saidasManuais: 0,
        devolucoes: 0,
        totalSaidas: 0,
        saldoEsperado: arredondar(valorInicial),
        quantidadeVendas: 0,
        quantidadeMovimentacoes: 0,
      },
    };
    db.caixas.push(caixa);
    return { data: clonar(detalhar(caixa)) };
  });

  registerMock("POST", "/caixas/:id/entrada", ({ params, body }) => {
    const caixa = encontrar(params["id"]!);
    exigirAberto(caixa);
    const payload = (body ?? {}) as Partial<EntradaCaixaPayload>;
    validarMovimento(payload, false);
    const autor = responsavel(payload.responsavelId ?? caixa.abertura.responsavelId);

    registrarMovimentacao({
      caixaId: caixa.id,
      dataHora: agora(),
      tipo: "entrada",
      origem: "manual",
      descricao: payload.descricao!.trim(),
      referencia: null,
      vendaId: null,
      vendaCodigo: null,
      formaPagamento: payload.formaPagamento!.trim(),
      valor: Number(payload.valor),
      sentido: "entrada",
      responsavelId: autor.id,
      responsavelNome: autor.nome,
      observacao: payload.observacao?.trim() ?? "",
      motivo: null,
    });

    return { data: clonar(detalhar(caixa)) };
  });

  /** Saída: nunca pode deixar o caixa negativo. */
  registerMock("POST", "/caixas/:id/saida", ({ params, body }) => {
    const caixa = encontrar(params["id"]!);
    exigirAberto(caixa);
    const payload = (body ?? {}) as Partial<SaidaCaixaPayload>;
    validarMovimento(payload, true);

    const saldo = calcularResumoCaixa(caixa).saldoEsperado;
    const valor = Number(payload.valor);
    if (valor > saldo)
      throw ApiError.validation("Dados inválidos.", [
        {
          field: "valor",
          message: `Saída maior que o saldo disponível (${saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}).`,
        },
      ]);

    const autor = responsavel(payload.responsavelId ?? caixa.abertura.responsavelId);
    registrarMovimentacao({
      caixaId: caixa.id,
      dataHora: agora(),
      tipo: "saida",
      origem: "manual",
      descricao: payload.descricao!.trim(),
      referencia: null,
      vendaId: null,
      vendaCodigo: null,
      formaPagamento: payload.formaPagamento!.trim(),
      valor,
      sentido: "saida",
      responsavelId: autor.id,
      responsavelNome: autor.nome,
      observacao: payload.observacao?.trim() ?? "",
      motivo: payload.motivo!.trim(),
    });

    return { data: clonar(detalhar(caixa)) };
  });

  /** Fechamento: conferência física + registro da diferença. */
  registerMock("POST", "/caixas/:id/fechamento", ({ params, body }) => {
    const caixa = encontrar(params["id"]!);
    exigirAberto(caixa);

    const payload = (body ?? {}) as Partial<FechamentoCaixaPayload>;
    const valorInformado = Number(payload.valorInformado ?? NaN);
    if (!Number.isFinite(valorInformado) || valorInformado < 0)
      throw ApiError.validation("Dados inválidos.", [
        { field: "valorInformado", message: "Informe o valor contado no caixa." },
      ]);

    const esperado = calcularResumoCaixa(caixa).saldoEsperado;
    const diferenca = arredondar(valorInformado - esperado);
    const observacao = payload.observacao?.trim() ?? "";
    if (Math.abs(diferenca) >= 0.005 && !observacao)
      throw ApiError.validation("Dados inválidos.", [
        {
          field: "observacao",
          message: "Justifique a diferença encontrada na conferência.",
        },
      ]);

    const autor = responsavel(payload.responsavelId ?? caixa.abertura.responsavelId);
    caixa.fechamento = {
      dataHora: agora(),
      responsavelId: autor.id,
      responsavelNome: autor.nome,
      valorInformado: arredondar(valorInformado),
      valorEsperado: esperado,
      diferenca,
      observacao,
    };
    caixa.status = "fechado";
    caixa.resumo = calcularResumoCaixa(caixa);

    return { data: clonar(detalhar(caixa)) };
  });
}
