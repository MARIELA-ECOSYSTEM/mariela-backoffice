import { useMemo, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useBloqueiosWhatsapp, useDesbloquearPorIdWhatsapp } from "@/hooks/use-whatsapp-oficial";
import { mensagemDeErro } from "@/services/api/client";
import { ROTULO_ORIGEM_BLOQUEIO } from "@/services/whatsapp/envio-oficial";
import { LIMITES_WHATSAPP_OFICIAL, type BloqueioWhatsapp } from "@/types/whatsapp-oficial";
import { formatarDataHora } from "@/utils/format";
import { Aviso } from "./comum";

/**
 * Lista de bloqueios (inclusive de números sem cliente cadastrado), sempre mascarados. Desbloqueio só pelo contrato do
 * backend (por id, motivo obrigatório); o registro continua no histórico (aparece em "Mostrar removidos").
 */
export function BloqueiosLista({ clientes }: { clientes: { id: string; nome: string }[] }) {
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paraDesbloquear, setParaDesbloquear] = useState<BloqueioWhatsapp | null>(null);
  const consulta = useBloqueiosWhatsapp({
    somenteAtivos,
    page: pagina,
    limit: LIMITES_WHATSAPP_OFICIAL.limitePagina,
  });
  const nomes = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);
  const bloqueios = consulta.data?.data ?? [];
  const total = Number(consulta.data?.meta.total ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch
          id="mostrar-removidos"
          checked={!somenteAtivos}
          onCheckedChange={(v) => {
            setSomenteAtivos(!v);
            setPagina(1);
          }}
        />
        <Label htmlFor="mostrar-removidos">Mostrar também bloqueios removidos</Label>
      </div>

      {consulta.isPending ? (
        <TableSkeleton linhas={4} colunas={5} />
      ) : consulta.isError ? (
        <ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} />
      ) : bloqueios.length === 0 ? (
        <EmptyState
          titulo="Nenhum bloqueio"
          descricao="Não há números bloqueados para mensagens de WhatsApp."
        />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <Table aria-label="Bloqueios de WhatsApp">
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Origem e motivo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bloqueios.map((b) => (
                <TableRow key={b.id} data-bloqueio-id={b.id}>
                  <TableCell>
                    {b.numeroMascarado}
                    <span className="block text-xs text-muted-foreground">
                      {b.tipoChave === "WAID" ? "Identificador do WhatsApp" : "Telefone"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {b.clienteId ? (nomes.get(b.clienteId) ?? "—") : "Sem cliente associado"}
                  </TableCell>
                  <TableCell>
                    {ROTULO_ORIGEM_BLOQUEIO[b.origem]}
                    {b.motivo ? (
                      <span className="block text-xs text-muted-foreground">“{b.motivo}”</span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      desde {formatarDataHora(b.criadoEm)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {b.ativo ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <>
                        <Badge variant="outline">Removido</Badge>
                        <span className="block text-xs text-muted-foreground">
                          {b.desbloqueadoEm ? formatarDataHora(b.desbloqueadoEm) : ""}
                          {b.motivoDesbloqueio ? ` · “${b.motivoDesbloqueio}”` : ""}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {b.ativo ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Desbloquear ${b.numeroMascarado}`}
                        onClick={() => setParaDesbloquear(b)}
                      >
                        <ShieldCheck aria-hidden className="size-4" /> Desbloquear
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Paginacao
        pagina={pagina}
        totalPaginas={Number(consulta.data?.meta.totalPages ?? 1)}
        total={total}
        rotulo="bloqueios"
        onPaginaChange={setPagina}
      />

      <DesbloqueioDialog
        bloqueio={paraDesbloquear}
        onOpenChange={(a) => !a && setParaDesbloquear(null)}
      />
    </div>
  );
}

function DesbloqueioDialog({
  bloqueio,
  onOpenChange,
}: {
  bloqueio: BloqueioWhatsapp | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const desbloquear = useDesbloquearPorIdWhatsapp();
  const [motivo, setMotivo] = useState("");
  const emAndamento = useRef(false);
  const motivoLimpo = motivo.trim();
  const valido =
    motivoLimpo.length >= LIMITES_WHATSAPP_OFICIAL.motivoDesbloqueioMin &&
    motivoLimpo.length <= LIMITES_WHATSAPP_OFICIAL.motivoDesbloqueioMax;

  async function confirmar() {
    if (!bloqueio || emAndamento.current) return;
    emAndamento.current = true;
    try {
      await desbloquear.mutateAsync({ id: bloqueio.id, motivo: motivoLimpo });
      toast.success("Bloqueio removido. O histórico do bloqueio foi preservado.");
      setMotivo("");
      onOpenChange(false);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível remover o bloqueio."));
    } finally {
      emAndamento.current = false;
    }
  }

  return (
    <Dialog
      open={bloqueio !== null}
      onOpenChange={(a) => {
        if (!a && emAndamento.current) return;
        if (!a) setMotivo("");
        onOpenChange(a);
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Desbloquear número</DialogTitle>
          <DialogDescription>{bloqueio?.numeroMascarado}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Aviso titulo="Desbloquear reverte um pedido de não contato">
            Só desbloqueie com a autorização do próprio contato. O motivo é obrigatório e fica
            registrado.
          </Aviso>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-desbloqueio">Motivo do desbloqueio</Label>
            <Input
              id="motivo-desbloqueio"
              value={motivo}
              maxLength={LIMITES_WHATSAPP_OFICIAL.motivoDesbloqueioMax}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={desbloquear.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!valido || desbloquear.isPending}
            onClick={() => void confirmar()}
          >
            {desbloquear.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Confirmar desbloqueio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
