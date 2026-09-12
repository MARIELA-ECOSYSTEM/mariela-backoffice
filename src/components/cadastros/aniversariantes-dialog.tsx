import { useEffect, useMemo, useRef, useState } from "react";
import { Cake, CalendarDays, Clock, Loader2, MessageCircle, Send, Users } from "lucide-react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AvatarPessoa } from "@/components/common/pessoa-card";
import { useEnviarMensagemWhatsapp } from "@/hooks/use-whatsapp";
import { mensagemDeErro } from "@/services/api/client";
import { MENSAGEM_ANIVERSARIO_LOTE, montarMensagemLote } from "@/services/whatsapp/messages";
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
import type { Cliente } from "@/types/cliente";

const ICONES: Record<PeriodoAniversario, typeof Cake> = {
  hoje: CalendarDays,
  amanha: Clock,
  semana: Users,
  mes: CalendarDays,
};

/**
 * Dialog de aniversariantes: abas por período com contagem dinâmica, seleção
 * múltipla de clientes e mensagem personalizável enviada em lote via
 * POST /integracoes/whatsapp/mensagens (um envio por cliente selecionado).
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
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState(MENSAGEM_ANIVERSARIO_LOTE);
  const enviar = useEnviarMensagemWhatsapp();
  // Guarda síncrona via ref: impede um duplo clique real em "Enviar" disparar
  // o laço de envios em lote duas vezes (mesmo padrão da Etapa 20).
  const enviandoRef = useRef(false);

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
  const elegiveis = useMemo(() => lista.filter((c) => numeroWhatsapp(c) !== ""), [lista]);
  const todosSelecionados = elegiveis.length > 0 && selecionados.length === elegiveis.length;

  useEffect(() => {
    if (open) {
      setPeriodo("hoje");
      setMensagem(MENSAGEM_ANIVERSARIO_LOTE);
    }
  }, [open]);

  useEffect(() => {
    setSelecionados([]);
  }, [periodo, open]);

  function alternar(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    );
  }

  async function enviarSelecionados() {
    const alvos = elegiveis.filter((cliente) => selecionados.includes(cliente.id));
    if (alvos.length === 0 || enviandoRef.current) return;
    enviandoRef.current = true;
    try {
      for (const cliente of alvos) {
        await enviar.mutateAsync({
          tipo: "CLIENTE",
          id: cliente.id,
          mensagem: montarMensagemLote(mensagem, cliente.nome),
        });
      }
      onOpenChange(false);
      toast.success(alvos.length === 1 ? "Mensagem enviada." : `${alvos.length} mensagens enviadas.`);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível enviar as mensagens."));
    } finally {
      enviandoRef.current = false;
    }
  }

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
                Envie mensagens personalizadas para os aniversariantes via WhatsApp.
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

        <div className="grid gap-4 md:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-border">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-surface/60 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users aria-hidden className="size-4 text-primary" />
                Aniversariantes ({lista.length})
              </p>
              {elegiveis.length > 0 ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={todosSelecionados}
                    onCheckedChange={(marcado) =>
                      setSelecionados(marcado === true ? elegiveis.map((c) => c.id) : [])
                    }
                  />
                  Selecionar todos
                </label>
              ) : null}
            </header>

            {lista.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Cake aria-hidden className="size-9 opacity-50" />
                <p className="text-sm">Nenhum aniversariante encontrado</p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto p-2">
                {lista.map((cliente) => {
                  const anos = idade(cliente.dataNascimento);
                  const telefone = formatarTelefone(cliente.telefone);
                  const semTelefone = numeroWhatsapp(cliente) === "";
                  return (
                    <li key={cliente.id}>
                      <label
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                          selecionados.includes(cliente.id)
                            ? "border-primary/40 bg-primary-soft/40"
                            : "border-transparent hover:bg-surface/60"
                        } ${semTelefone ? "opacity-60" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={selecionados.includes(cliente.id)}
                          disabled={semTelefone}
                          onCheckedChange={() => alternar(cliente.id)}
                        />
                        <AvatarPessoa nome={cliente.nome} foto={cliente.foto} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {cliente.nome}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {anos === null ? "Idade não informada" : `${anos} anos`} ·{" "}
                            {diaMesNascimento(cliente.dataNascimento)} ·{" "}
                            {telefone || "sem telefone"}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border">
            <header className="flex items-center gap-2 border-b border-border bg-surface/60 px-3 py-2.5">
              <MessageCircle aria-hidden className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Mensagem Personalizada</p>
            </header>
            <div className="space-y-3 p-3">
              <Textarea
                aria-label="Mensagem de aniversário"
                rows={9}
                maxLength={1000}
                value={mensagem}
                onChange={(evento) => setMensagem(evento.target.value)}
                className="resize-none bg-primary-soft/25"
              />
              <p className="rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">💡 Dica:</span> A mensagem será
                personalizada com o nome de cada cliente automaticamente.
              </p>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void enviarSelecionados()}
            disabled={enviar.isPending || selecionados.length === 0 || !mensagem.trim()}
          >
            {enviar.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Send aria-hidden className="size-4" />
            )}
            {enviar.isPending ? "Enviando…" : `Enviar (${selecionados.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
