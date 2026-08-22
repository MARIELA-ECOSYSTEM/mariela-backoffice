import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GrupoFacetaRenderizavel } from "@/lib/filtros/facetas";
import { cn } from "@/lib/utils";

const BUSCA_AUTOMATICA = 8;
const MAX_LABELS_NO_BOTAO = 2;

/** Rótulo compacto do botão: nomes quando poucos, contagem quando muitos. */
function rotuloBotao(grupo: GrupoFacetaRenderizavel): string {
  const selecionadas = grupo.opcoes.filter((opcao) => opcao.selecionada);
  if (selecionadas.length === 0) return grupo.label;
  if (selecionadas.length <= MAX_LABELS_NO_BOTAO) {
    return `${grupo.label}: ${selecionadas.map((opcao) => opcao.label).join(", ")}`;
  }
  return `${grupo.label}: ${selecionadas.length} selecionadas`;
}

/**
 * Filtro facetado em dropdown/combobox com múltipla seleção.
 * Padrão único do MARIELA BACKOFFICE — as contagens vêm da camada de dados.
 */
export function FilterDropdown({
  grupo,
  onAlternar,
  onLimpar,
}: {
  grupo: GrupoFacetaRenderizavel;
  onAlternar: (grupoId: string, valor: string) => void;
  onLimpar: (grupoId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");

  const buscavel = grupo.buscavel ?? grupo.opcoes.length > BUSCA_AUTOMATICA;

  const filtradas = useMemo(() => {
    const texto = termo.trim().toLowerCase();
    if (!texto) return grupo.opcoes;
    return grupo.opcoes.filter((opcao) => opcao.label.toLowerCase().includes(texto));
  }, [grupo.opcoes, termo]);

  if (grupo.opcoes.length === 0) return null;

  const ativo = grupo.totalSelecionado > 0;

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        if (!proximo) setTermo("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={aberto}
          className={cn(
            "h-9 max-w-[16rem] justify-between gap-2 rounded-full border-border bg-background px-3.5 font-normal",
            ativo && "border-primary/45 bg-primary-soft/60 text-primary",
          )}
        >
          <span className="truncate">{rotuloBotao(grupo)}</span>
          {ativo ? (
            <span className="shrink-0 rounded-full bg-primary/12 px-1.5 text-xs tabular-nums text-primary">
              {grupo.totalSelecionado}
            </span>
          ) : null}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 overflow-hidden p-0">
        <div className="border-b border-border/70 bg-primary-soft/35 px-3 py-2">
          <p className="font-brand text-[0.66rem] uppercase tracking-[0.16em] text-muted-foreground">
            {grupo.label}
          </p>
        </div>

        {buscavel ? (
          <div className="relative border-b border-border/70 p-2">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              aria-label={grupo.placeholderBusca ?? `Buscar em ${grupo.label}`}
              placeholder={grupo.placeholderBusca ?? `Buscar em ${grupo.label.toLowerCase()}…`}
              value={termo}
              onChange={(event) => setTermo(event.target.value)}
              className="h-8 border-transparent bg-muted/50 pl-8 text-sm"
            />
          </div>
        ) : null}

        <ScrollArea className="max-h-64">
          <div className="p-1.5">
            {filtradas.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma opção encontrada.</p>
            ) : (
              filtradas.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  role="option"
                  aria-selected={opcao.selecionada}
                  disabled={opcao.desabilitada}
                  onClick={() => onAlternar(grupo.id, opcao.valor)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    "hover:bg-primary-soft/60 focus-visible:outline-none focus-visible:bg-primary-soft/60",
                    opcao.selecionada && "bg-primary-soft/50",
                    opcao.desabilitada && "cursor-not-allowed opacity-45 hover:bg-transparent",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[0.28rem] border border-border bg-background",
                      opcao.selecionada && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {opcao.selecionada ? <Check className="size-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm text-foreground/85",
                      opcao.selecionada && "font-medium text-foreground",
                    )}
                  >
                    {opcao.label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums text-primary/70",
                      opcao.selecionada && "text-primary",
                    )}
                  >
                    ({opcao.count})
                  </span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {ativo ? (
          <div className="flex items-center justify-between border-t border-border/70 px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onLimpar(grupo.id)}
            >
              Limpar seleção
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary"
              onClick={() => setAberto(false)}
            >
              Fechar
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
