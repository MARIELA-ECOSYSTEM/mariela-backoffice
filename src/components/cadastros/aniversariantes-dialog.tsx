import { useMemo, useState } from "react";
import { Cake } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarPessoa } from "@/components/common/pessoa-card";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import {
  PERIODOS_ANIVERSARIO,
  aniversarioNoPeriodo,
  diaMesNascimento,
  diasAteAniversario,
  idade,
  numeroWhatsapp,
  type PeriodoAniversario,
} from "@/utils/cliente";
import type { Cliente } from "@/types/cliente";

/** Dialog de aniversariantes com abas por período e contagem dinâmica. */
export function AniversariantesDialog({
  open,
  onOpenChange,
  clientes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: Cliente[];
}) {
  const [periodo, setPeriodo] = useState<PeriodoAniversario>("hoje");

  const porPeriodo = useMemo(() => {
    const mapa = {} as Record<PeriodoAniversario, Cliente[]>;
    PERIODOS_ANIVERSARIO.forEach(({ valor }) => {
      mapa[valor] = clientes
        .filter((cliente) => aniversarioNoPeriodo(cliente.dataNascimento, valor))
        .sort(
          (a, b) =>
            diasAteAniversario(a.dataNascimento) - diasAteAniversario(b.dataNascimento) ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        );
    });
    return mapa;
  }, [clientes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <Cake aria-hidden className="size-6 text-primary" />
            Aniversariantes
          </DialogTitle>
          <DialogDescription>
            Clientes com aniversário próximo — ideal para uma mensagem de relacionamento.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={periodo} onValueChange={(valor) => setPeriodo(valor as PeriodoAniversario)}>
          <TabsList className="w-full">
            {PERIODOS_ANIVERSARIO.map(({ valor, label }) => (
              <TabsTrigger key={valor} value={valor} className="flex-1">
                {label} ({porPeriodo[valor]?.length ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {PERIODOS_ANIVERSARIO.map(({ valor }) => {
            const lista = porPeriodo[valor] ?? [];
            return (
              <TabsContent key={valor} value={valor} className="mt-4">
                {lista.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Não há aniversariantes neste período.
                  </p>
                ) : (
                  <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                    {lista.map((cliente) => {
                      const anos = idade(cliente.dataNascimento);
                      return (
                        <li
                          key={cliente.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5"
                        >
                          <AvatarPessoa
                            nome={cliente.nome}
                            foto={cliente.foto}
                            className="size-10"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{cliente.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {anos === null ? "Idade não informada" : `${anos} anos`} ·{" "}
                              {diaMesNascimento(cliente.dataNascimento)} ·{" "}
                              {numeroWhatsapp(cliente) || "sem telefone"}
                            </p>
                          </div>
                          <BotaoWhatsapp
                            nome={cliente.nome}
                            numero={numeroWhatsapp(cliente)}
                            variante="botao"
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
