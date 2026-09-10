import { registerMock } from "./mock-transport";
import { agora, clonar, db, gerarId } from "./db";
import { ApiError } from "@/types/api";
import type {
  Adquirente,
  AtualizarAdquirentePayload,
  CriarAdquirentePayload,
  ModalidadeTarifa,
  TarifaConfig,
  TarifaConfigPayload,
} from "@/types/adquirente";

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/** Só adquirentes NÃO excluídas — mesmo filtro de `encontrarPorIdOuFalhar`/`listarAtivas` no backend real. */
function encontrarAtiva(id: string): Adquirente {
  const adquirente = db.adquirentes.find((item) => item.id === id && item.excluidoEm === null);
  if (!adquirente) throw ApiError.notFound("Adquirente não encontrada.");
  return adquirente;
}

function garantirNomeDisponivel(nomeNormalizado: string, ignorarId?: string): void {
  const existente = db.adquirentes.find(
    (item) =>
      item.excluidoEm === null &&
      item.id !== ignorarId &&
      normalizarNome(item.nome) === nomeNormalizado,
  );
  if (existente) throw ApiError.conflict("Já existe uma adquirente cadastrada com este nome.");
}

/**
 * Mesmas regras de `AdquirentesService.validarTabelaTarifas` no backend real:
 * débito só aceita 1 parcela, e nenhuma combinação (modalidade, parcelas)
 * pode se repetir na mesma tabela.
 */
function validarTabelaTarifas(tarifas: TarifaConfigPayload[]): TarifaConfig[] {
  const vistos = new Set<string>();
  for (const tarifa of tarifas) {
    if (tarifa.modalidade === "debito" && tarifa.parcelas !== 1) {
      throw ApiError.validation("Dados inválidos.", [
        { field: "tabelaTarifas", message: "Débito só pode ter 1 parcela." },
      ]);
    }
    const chave = `${tarifa.modalidade}:${tarifa.parcelas}`;
    if (vistos.has(chave)) {
      throw ApiError.validation("Dados inválidos.", [
        {
          field: "tabelaTarifas",
          message: `Já existe uma tarifa para ${tarifa.modalidade === "credito" ? "crédito" : "débito"} em ${tarifa.parcelas}x.`,
        },
      ]);
    }
    vistos.add(chave);
  }
  return tarifas.map((tarifa) => ({
    id: gerarId("tar"),
    modalidade: tarifa.modalidade as ModalidadeTarifa,
    parcelas: tarifa.parcelas,
    percentual: arredondar(tarifa.percentual),
  }));
}

export function registerAdquirentesMocks(): void {
  registerMock("GET", "/adquirentes", ({ query }) => {
    const busca = typeof query["busca"] === "string" ? query["busca"].trim().toLowerCase() : "";
    const page = Number(query["page"] ?? 1) || 1;
    const limit = Number(query["limit"] ?? 20) || 20;

    const ativas = db.adquirentes
      .filter((item) => item.excluidoEm === null)
      .filter((item) => !busca || item.nome.toLowerCase().includes(busca))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    const total = ativas.length;
    const inicio = (page - 1) * limit;
    const pagina = ativas.slice(inicio, inicio + limit);

    return {
      data: clonar(pagina),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  });

  registerMock("GET", "/adquirentes/:id", ({ params }) => ({
    data: clonar(encontrarAtiva(params["id"]!)),
  }));

  registerMock("POST", "/adquirentes", ({ body }) => {
    const payload = (body ?? {}) as Partial<CriarAdquirentePayload>;
    const nome = (payload.nome ?? "").trim();
    if (!nome)
      throw ApiError.validation("Dados inválidos.", [
        { field: "nome", message: "Nome é obrigatório." },
      ]);

    const nomeNormalizado = normalizarNome(nome);
    garantirNomeDisponivel(nomeNormalizado);
    const tabelaTarifas = validarTabelaTarifas(payload.tabelaTarifas ?? []);

    const adquirente: Adquirente = {
      id: gerarId("adq"),
      nome,
      ativo: payload.ativo ?? true,
      observacao: payload.observacao?.trim() || null,
      tabelaTarifas,
      excluidoEm: null,
      criadoEm: agora(),
      atualizadoEm: agora(),
    };
    db.adquirentes.unshift(adquirente);
    return { data: clonar(adquirente) };
  });

  registerMock("PATCH", "/adquirentes/:id", ({ params, body }) => {
    const adquirente = encontrarAtiva(params["id"]!);
    const payload = (body ?? {}) as Partial<AtualizarAdquirentePayload>;

    if (payload.nome !== undefined) {
      const nome = payload.nome.trim();
      if (!nome)
        throw ApiError.validation("Dados inválidos.", [
          { field: "nome", message: "Nome não pode ser vazio." },
        ]);
      garantirNomeDisponivel(normalizarNome(nome), adquirente.id);
      adquirente.nome = nome;
    }
    if (payload.ativo !== undefined) adquirente.ativo = payload.ativo;
    if (payload.observacao !== undefined)
      adquirente.observacao = payload.observacao?.trim() || null;
    if (payload.tabelaTarifas !== undefined) {
      adquirente.tabelaTarifas = validarTabelaTarifas(payload.tabelaTarifas);
    }
    adquirente.atualizadoEm = agora();

    return { data: clonar(adquirente) };
  });

  registerMock("DELETE", "/adquirentes/:id", ({ params }) => {
    const adquirente = encontrarAtiva(params["id"]!);
    adquirente.excluidoEm = agora();
    return { data: { id: adquirente.id } };
  });
}
