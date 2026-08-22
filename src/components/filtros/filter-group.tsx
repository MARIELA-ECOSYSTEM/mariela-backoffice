import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterCheckbox } from "@/components/filtros/filter-checkbox";
import type { GrupoFacetaRenderizavel } from "@/lib/filtros/facetas";

const LIMITE_PADRAO = 6;
const BUSCA_AUTOMATICA = 8;

/** Grupo de filtro com contagem, busca interna e "Ver mais". */
export function FilterGroup({
  grupo,
  onAlternar,
  onLimpar,
}: {
  grupo: GrupoFacetaRenderizavel;
  onAlternar: (grupoId: string, valor: string) => void;
  onLimpar: (grupoId: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [expandido, setExpandido] = useState(false);

  const buscavel = grupo.buscavel ?? grupo.opcoes.length > BUSCA_AUTOMATICA;
  const limite = grupo.limiteVisivel ?? LIMITE_PADRAO;

  const filtradas = useMemo(() => {
    const texto = termo.trim().toLowerCase();
    if (!texto) return grupo.opcoes;
    return grupo.opcoes.filter((opcao) => opcao.label.toLowerCase().includes(texto));
  }, [grupo.opcoes, termo]);

  const visiveis = expandido || termo ? filtradas : filtradas.slice(0, limite);
  const restantes = filtradas.length - visiveis.length;

  if (grupo.opcoes.length === 0) return null;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex w-full items-center justify-between gap-2">
        <span className="font-brand text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          {grupo.label}
        </span>
        {grupo.totalSelecionado > 0 ? (
          <button
            type="button"
            onClick={() => onLimpar(grupo.id)}
            className="text-[0.68rem] text-primary underline-offset-2 hover:underline"
          >
            limpar
          </button>
        ) : null}
      </legend>

      {buscavel ? (
        <div className="relative mb-2">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={grupo.placeholderBusca ?? `Buscar em ${grupo.label}`}
            placeholder={grupo.placeholderBusca ?? `Buscar em ${grupo.label.toLowerCase()}…`}
            value={termo}
            onChange={(event) => setTermo(event.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      ) : null}

      <div className="space-y-0.5">
        {visiveis.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma opção encontrada.</p>
        ) : (
          visiveis.map((opcao) => (
            <FilterCheckbox
              key={opcao.valor}
              id={`filtro-${grupo.id}-${opcao.valor}`}
              label={opcao.label}
              count={opcao.count}
              checked={opcao.selecionada}
              disabled={opcao.desabilitada}
              onCheckedChange={() => onAlternar(grupo.id, opcao.valor)}
            />
          ))
        )}
      </div>

      {!termo && (restantes > 0 || expandido) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-xs text-primary"
          onClick={() => setExpandido((atual) => !atual)}
        >
          <ChevronDown
            aria-hidden
            className={`size-3.5 transition-transform ${expandido ? "rotate-180" : ""}`}
          />
          {expandido ? "Ver menos" : `Ver mais (${restantes})`}
        </Button>
      ) : null}
    </fieldset>
  );
}
