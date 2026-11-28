import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cake, CalendarDays, Clock, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AvatarPessoa } from "@/components/common/pessoa-card";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import {
  DialogMensagemWhatsapp,
  type AlvoMensagemWhatsapp,
} from "@/components/cadastros/dialog-mensagem-whatsapp";
import {
  PERIODOS_ANIVERSARIO,
  aniversarioNoPeriodo,
  diaMesNascimento,
  diasAteAniversario,
  formatarTelefone,
  idade,
  numeroWhatsapp,
  type PeriodoAniversario,
} from "@/utils/cliente";
import { normalizarTelefoneWhatsapp } from "@/utils/whatsapp-link";
import type { Cliente } from "@/types/cliente";

const ICONES: Record<PeriodoAniversario, typeof Cake> = {
  hoje: CalendarDays,
  amanha: Clock,
  semana: Users,
  mes: CalendarDays,
};

/**
 * Dialog de aniversariantes: abas por período com contagem dinâmica e, para cada cliente, um botão "Abrir WhatsApp".
 *
 * Fase 2 (`wa.me`) — o botão abre o diálogo compartilhado da Fase 1 (`DialogMensagemWhatsapp`) com a mensagem de
 * aniversário (a padrão das Configurações, se houver) e o nome da cliente; ela revisa, edita e abre a conversa. Uma
 * conversa por clique: sem envio automático, sem lote, sem fila e sem chamada de envio ao backend.
 */
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
  const [alvo, setAlvo] = useState<AlvoMensagemWhatsapp | null>(null);

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

  const lista = useMemo(() => porPeriodo[periodo] ?? [], [porPeriodo, periodo]);

  useEffect(() => {
    if (open) setPeriodo("hoje");
    else setAlvo(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Cake aria-hidden className="size-6" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-display text-3xl">Mensagens de Aniversário</DialogTitle>
              <DialogDescription>
                Escolha uma aniversariante, revise a mensagem e abra a conversa no WhatsApp. Nada é
                enviado por aqui: você envia no próprio WhatsApp.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={periodo} onValueChange={(valor) => setPeriodo(valor as PeriodoAniversario)}>
          <TabsList className="w-full">
            {PERIODOS_ANIVERSARIO.map(({ valor, label }) => {
              const Icone = ICONES[valor];
              return (
                <TabsTrigger key={valor} value={valor} className="flex-1 gap-1.5">
                  <Icone aria-hidden className="size-4" />
                  {label} ({porPeriodo[valor]?.length ?? 0})
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <section className="overflow-hidden rounded-xl border border-border">
          <header className="flex items-center gap-2 border-b border-border bg-surface/60 px-3 py-2.5">
            <Users aria-hidden className="size-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Aniversariantes ({lista.length})</p>
          </header>

          {lista.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Cake aria-hidden className="size-9 opacity-50" />
              <p className="text-sm">Nenhum aniversariante encontrado</p>
            </div>
          ) : (
            <ul aria-label="Aniversariantes" className="max-h-80 space-y-1 overflow-y-auto p-2">
              {lista.map((cliente) => {
                const anos = idade(cliente.dataNascimento);
                const telefone = formatarTelefone(cliente.telefone);
                const whatsapp = normalizarTelefoneWhatsapp(numeroWhatsapp(cliente));
                return (
                  <li
                    key={cliente.id}
                    data-cliente-id={cliente.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface/60"
                  >
                    <AvatarPessoa nome={cliente.nome} foto={cliente.foto} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{cliente.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {anos === null ? "Idade não informada" : `${anos} anos`} ·{" "}
                        {diaMesNascimento(cliente.dataNascimento)} · {telefone || "sem telefone"}
                      </p>
                      {whatsapp.valido ? null : (
                        <p className="flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
                          Sem WhatsApp válido: {whatsapp.motivo}
                        </p>
                      )}
                    </div>
                    <BotaoWhatsapp
                      nome={cliente.nome}
                      numero={numeroWhatsapp(cliente)}
                      variante="botao"
                      rotulo="Abrir WhatsApp"
                      onClick={() =>
                        setAlvo({
                          id: cliente.id,
                          nome: cliente.nome,
                          telefone: cliente.telefone,
                          entidade: "CLIENTE",
                          tipoMensagem: "aniversario",
                          papel: "Aniversariante",
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>

        <DialogMensagemWhatsapp
          alvo={alvo}
          onOpenChange={(aberto) => {
            if (!aberto) setAlvo(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
