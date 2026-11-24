import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useMensagensWhatsapp } from "@/hooks/use-whatsapp-oficial";
import { ROTULO_ESTADO_MENSAGEM, ROTULO_ORIGEM_MENSAGEM } from "@/services/whatsapp/envio-oficial";
import {
  ESTADOS_MENSAGEM_WHATSAPP,
  LIMITES_WHATSAPP_OFICIAL,
  type EstadoMensagemWhatsapp,
  type FiltrosMensagensWhatsapp,
} from "@/types/whatsapp-oficial";
import { formatarDataHora } from "@/utils/format";
import { DetalheMensagemDialog } from "./detalhe-mensagem-dialog";
import { EstadoMensagemBadge } from "./comum";

const TODOS = "todos";

/**
 * Histórico das mensagens do fluxo oficial, paginado NO BACKEND, com os filtros que o backend aceita (cliente,
 * estado e ano da campanha). Estados e telefones (mascarados) aparecem exatamente como vieram.
 */
export function HistoricoMensagens({
  clientes,
  clienteInicial,
}: {
  clientes: { id: string; nome: string }[];
  clienteInicial?: string | undefined;
}) {
  const [clienteId, setClienteId] = useState<string | undefined>(clienteInicial);
  const [estado, setEstado] = useState<EstadoMensagemWhatsapp | undefined>(undefined);
  const [campanhaAno, setCampanhaAno] = useState<number | undefined>(undefined);
  const [pagina, setPagina] = useState(1);
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const filtros: FiltrosMensagensWhatsapp = {
    clienteId,
    estado,
    campanhaAno,
    page: pagina,
    limit: LIMITES_WHATSAPP_OFICIAL.limitePagina,
  };
  const consulta = useMensagensWhatsapp(filtros);

  const nomes = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);
  const ordenados = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes],
  );
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  const mensagens = consulta.data?.data ?? [];
  const total = Number(consulta.data?.meta.total ?? 0);
  const totalPaginas = Number(consulta.data?.meta.totalPages ?? 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtros do histórico">
        <Select
          value={clienteId ?? TODOS}
          onValueChange={(v) => {
            setClienteId(v === TODOS ? undefined : v);
            setPagina(1);
          }}
        >
          <SelectTrigger aria-label="Filtrar por cliente" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os clientes</SelectItem>
            {ordenados.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={estado ?? TODOS}
          onValueChange={(v) => {
            setEstado(v === TODOS ? undefined : (v as EstadoMensagemWhatsapp));
            setPagina(1);
          }}
        >
          <SelectTrigger aria-label="Filtrar por estado" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os estados</SelectItem>
            {ESTADOS_MENSAGEM_WHATSAPP.map((e) => (
              <SelectItem key={e} value={e}>
                {ROTULO_ESTADO_MENSAGEM[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={campanhaAno === undefined ? TODOS : String(campanhaAno)}
          onValueChange={(v) => {
            setCampanhaAno(v === TODOS ? undefined : Number(v));
            setPagina(1);
          }}
        >
          <SelectTrigger aria-label="Filtrar por ano da campanha" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Sem filtro de campanha</SelectItem>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                Campanha de {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {consulta.isSuccess ? (
          <span className="text-sm text-muted-foreground">{total} mensagem(ns)</span>
        ) : null}
      </div>

      {consulta.isPending ? (
        <TableSkeleton linhas={5} colunas={6} />
      ) : consulta.isError ? (
        <ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} />
      ) : mensagens.length === 0 ? (
        <EmptyState
          titulo="Nenhuma mensagem encontrada"
          descricao="Nenhuma mensagem do WhatsApp oficial corresponde aos filtros escolhidos."
        />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <Table aria-label="Histórico de mensagens">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mensagens.map((m) => (
                <TableRow key={m.id} data-mensagem-id={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataHora(m.criadoEm)}
                  </TableCell>
                  <TableCell>
                    <span className="block">{nomes.get(m.destinatario.id) ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.destinatario.telefoneMascarado}
                    </span>
                  </TableCell>
                  <TableCell>{m.template.chave}</TableCell>
                  <TableCell>
                    {ROTULO_ORIGEM_MENSAGEM[m.origem]}
                    {m.campanha ? (
                      <span className="block text-xs text-muted-foreground">{m.campanha.ano}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <EstadoMensagemBadge estado={m.estado} />
                    {m.liberacao ? (
                      <span className="block text-xs text-muted-foreground">reenvio liberado</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Detalhes da mensagem de ${formatarDataHora(m.criadoEm)}`}
                      onClick={() => setDetalhe(m.id)}
                    >
                      <Eye aria-hidden className="size-4" /> Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Paginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        total={total}
        rotulo="mensagens"
        onPaginaChange={setPagina}
      />

      <DetalheMensagemDialog
        mensagemId={detalhe}
        nomeCliente={(id) => nomes.get(id) ?? null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
      />
    </div>
  );
}
