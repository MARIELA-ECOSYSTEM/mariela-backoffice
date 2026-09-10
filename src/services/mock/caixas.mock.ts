import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId } from "./db";
import { proximoCodigo } from "./sequencias";
import {
  caixaAberto,
  calcularResumoCaixa,
  encontrarMovimentoPorIdempotencyKey,
  movimentacoesDoCaixa,
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

/**
 * Etapa 18.6 — o Caixa Geral da Loja não tem responsável/vendedor vinculado
 * (Etapas 18.2-18.5 do backend real). `abertura.responsavelNome`/
 * `fechamento.responsavelNome` continuam existindo na resposta só por
 * compatibilidade de tela (o Backoffice ainda exibe/filtra por eles — ver
 * auditoria da Etapa 18.5), sempre com este valor fixo, exatamente como o
 * backend real sempre devolve `"Loja"` independentemente de quem operou.
 */
const RESPONSAVEL_FIXO = { id: null as string | null, nome: "Loja" };

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
    // Etapa 18.6 — "recebimento" não é mais um conceito do domínio (ver
    // types/caixa.ts): sempre vazio, igual ao backend real.
    recebimentos: [],
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
    // Etapa 18.6 — "recebimento" não é mais um tipo distinto; sempre 0 (mesma regra do backend real).
    recebimentosHoje: 0,
    devolucoesHoje: somar(["cancelamento"]),
    saldoEsperadoAtual: aberto ? calcularResumoCaixa(aberto).saldoEsperado : 0,
    diferencaAcumulada: arredondar(
      db.caixas.reduce((total, caixa) => total + (caixa.fechamento?.diferenca ?? 0), 0),
    ),
  };
}

/**
 * Dedupe global de movimentação manual por `idempotencyKey` (Etapa 18.30),
 * espelhando `MovimentosCaixaRepository.criar` do backend: mesma key + mesma
 * operação (tipo/valor/forma) → replay silencioso (retorna o caixa como
 * está); mesma key + operação diferente → 409. Retorna `null` quando deve
 * prosseguir com o registro normal (chave nova ou não informada).
 */
function tratarIdempotenciaMovimento(
  caixa: Caixa,
  idempotencyKey: string | undefined,
  tipo: "injecao" | "sangria",
  valor: number,
  formaPagamento: string,
): CaixaDetalhe | null {
  if (!idempotencyKey) return null;
  const existente = encontrarMovimentoPorIdempotencyKey(idempotencyKey);
  if (!existente) return null;
  const mesmaOperacao =
    existente.tipo === tipo &&
    arredondar(existente.valor) === arredondar(valor) &&
    existente.formaPagamento === formaPagamento;
  if (!mesmaOperacao)
    throw ApiError.conflict(
      "Esta idempotencyKey já foi usada para um movimento de caixa diferente. Gere uma nova chave para esta operação.",
    );
  return detalhar(caixa);
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

  // Etapa 18.6 — `/caixas/:id/vendas` e `/caixas/:id/recebimentos` não são
  // registradas: não existem no backend real desde a Etapa 18.2 (as vendas
  // do caixa já vêm embutidas em `CaixaDetalhe.vendas`, ver `detalhar()`) e
  // `caixasApi` não tem mais métodos apontando para elas (Etapa 18.5/18.6).

  /** Abertura: apenas um caixa aberto por vez. */
  registerMock("POST", "/caixas", ({ body }) => {
    if (caixaAberto()) throw ApiError.validation("Já existe um caixa aberto.");

    const payload = (body ?? {}) as Partial<AberturaCaixaPayload>;
    const valorInicial = Number(payload.valorInicial ?? NaN);
    if (!Number.isFinite(valorInicial) || valorInicial < 0)
      throw ApiError.validation("Dados inválidos.", [
        { field: "valorInicial", message: "Informe o valor inicial do caixa." },
      ]);

    const caixa: Caixa = {
      id: gerarId("cx"),
      codigo: proximoCodigo("caixa"),
      status: "aberto",
      abertura: {
        dataHora: agora(),
        responsavelId: RESPONSAVEL_FIXO.id,
        responsavelNome: RESPONSAVEL_FIXO.nome,
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

    const idempotencyKey = payload.idempotencyKey?.trim() || undefined;
    const replay = tratarIdempotenciaMovimento(
      caixa,
      idempotencyKey,
      "injecao",
      Number(payload.valor),
      payload.formaPagamento!.trim(),
    );
    if (replay) return { data: clonar(replay) };

    registrarMovimentacao({
      caixaId: caixa.id,
      dataHora: agora(),
      tipo: "injecao",
      origem: "manual",
      descricao: payload.descricao!.trim(),
      referencia: null,
      vendaId: null,
      vendaCodigo: null,
      formaPagamento: payload.formaPagamento!.trim(),
      valor: Number(payload.valor),
      sentido: "entrada",
      observacao: payload.observacao?.trim() ?? "",
      motivo: null,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    return { data: clonar(detalhar(caixa)) };
  });

  /**
   * Saída (sangria). Etapa 18.6 — NÃO bloqueia por saldo: o backend real
   * permite sangria maior que o saldo disponível, deixando o Caixa negativo
   * (Etapas 18.2-18.4). O mock precisa simular o mesmo comportamento, senão
   * o Backoffice rodando contra o mock ficaria mais restritivo que contra a
   * API real.
   */
  registerMock("POST", "/caixas/:id/saida", ({ params, body }) => {
    const caixa = encontrar(params["id"]!);
    exigirAberto(caixa);
    const payload = (body ?? {}) as Partial<SaidaCaixaPayload>;
    validarMovimento(payload, true);
    const valor = Number(payload.valor);

    const idempotencyKey = payload.idempotencyKey?.trim() || undefined;
    const replay = tratarIdempotenciaMovimento(
      caixa,
      idempotencyKey,
      "sangria",
      valor,
      payload.formaPagamento!.trim(),
    );
    if (replay) return { data: clonar(replay) };

    registrarMovimentacao({
      caixaId: caixa.id,
      dataHora: agora(),
      tipo: "sangria",
      origem: "manual",
      descricao: payload.descricao!.trim(),
      referencia: null,
      vendaId: null,
      vendaCodigo: null,
      formaPagamento: payload.formaPagamento!.trim(),
      valor,
      sentido: "saida",
      observacao: payload.observacao?.trim() ?? "",
      motivo: payload.motivo!.trim(),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    return { data: clonar(detalhar(caixa)) };
  });

  /**
   * Fechamento: conferência física + registro da diferença. Etapa 18.6 — SEM
   * piso zero: `valorInformado` pode ser negativo, porque o Caixa pode
   * fechar negativo (Etapas 18.2-18.4). Só `Number.isFinite` é exigido.
   */
  registerMock("POST", "/caixas/:id/fechamento", ({ params, body }) => {
    const caixa = encontrar(params["id"]!);
    exigirAberto(caixa);

    const payload = (body ?? {}) as Partial<FechamentoCaixaPayload>;
    const valorInformado = Number(payload.valorInformado ?? NaN);
    if (!Number.isFinite(valorInformado))
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

    caixa.fechamento = {
      dataHora: agora(),
      responsavelId: RESPONSAVEL_FIXO.id,
      responsavelNome: RESPONSAVEL_FIXO.nome,
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
