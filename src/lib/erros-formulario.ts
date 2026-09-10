import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "@/types/api";

/**
 * Mapeia `error.errors[].field`/`message` (contrato real do backend — ver
 * `ApiFieldError` em `@/types/api`) para `form.setError(...)`, para os erros
 * de validação (`400 VALIDATION_ERROR`) exibirem a mensagem exata no campo
 * certo, além do toast geral que o chamador já mostra via `mensagemDeErro`.
 *
 * Só aplica os campos explicitamente listados em `campos` — nunca mapeia um
 * `field` que não conste nessa lista. Isso evita mapeamento especulativo
 * quando o nome do campo devolvido pelo backend não corresponde ao nome
 * usado pelo formulário (ex.: `fornecedor-dialog.tsx` acha os campos de
 * endereço, mas o backend os valida como `endereco.cep`, `endereco.bairro`…
 * — nesse caso, não inclua esses campos em `campos`, e a mensagem geral
 * continua sendo a única exibida, como já acontecia antes).
 */
export function aplicarErrosDeCampo<T extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T>,
  campos: readonly Path<T>[],
): void {
  if (!(error instanceof ApiError) || !error.errors.length) return;
  for (const item of error.errors) {
    const campo = campos.find((candidato) => candidato === item.field);
    if (campo) form.setError(campo, { type: "server", message: item.message });
  }
}
