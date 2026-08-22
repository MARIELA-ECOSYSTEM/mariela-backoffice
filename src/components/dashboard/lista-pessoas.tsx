import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { PessoaResumo } from "@/types/dashboard";
import { formatarData, iniciais } from "@/utils/format";

/** Resumo compacto de cadastros recentes (clientes ou fornecedores). */
export function ListaPessoas({
  titulo,
  descricao,
  pessoas,
  vazio,
}: {
  titulo: string;
  descricao: string;
  pessoas: PessoaResumo[];
  vazio: string;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="font-display text-xl">{titulo}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="pt-2">
        {pessoas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pessoas.map((pessoa) => (
              <li key={pessoa.id} className="flex items-center gap-3 py-3">
                <Avatar className="size-9">
                  {pessoa.foto ? <AvatarImage src={pessoa.foto} alt={pessoa.nome} /> : null}
                  <AvatarFallback className="bg-primary-soft text-[0.65rem] text-primary">
                    {iniciais(pessoa.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{pessoa.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {pessoa.detalhe || "—"} · desde {formatarData(pessoa.criadoEm)}
                  </p>
                </div>
                <Badge variant={pessoa.ativo ? "success" : "outline"}>
                  {pessoa.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
