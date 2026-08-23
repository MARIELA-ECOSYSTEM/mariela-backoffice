import { z } from "zod";

export const produtoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120, "Máximo de 120 caracteres."),
  descricao: z.string().trim().max(1000, "Máximo de 1000 caracteres.").optional(),
  categoria: z.string().trim().min(1, "Categoria é obrigatória."),
  colecaoId: z.string().optional(),
  campanhaId: z.string().optional(),
  fornecedorId: z.string().optional(),
  precoCusto: z.coerce
    .number({ invalid_type_error: "Informe um valor." })
    .positive("Preço de custo deve ser maior que zero."),
  precoVenda: z.coerce
    .number({ invalid_type_error: "Informe um valor." })
    .positive("Preço de venda deve ser maior que zero."),
  ehNovidade: z.boolean(),
});

export type ProdutoFormValues = z.infer<typeof produtoSchema>;

export const varianteSchema = z.object({
  codVariante: z.string().trim().min(1, "Código da variante é obrigatório.").max(40),
  cor: z.string().trim().min(1, "Cor é obrigatória."),
  foto: z.string().trim().max(500).optional(),
  video: z.string().trim().max(500).optional(),
});

export type VarianteFormValues = z.infer<typeof varianteSchema>;

export const tamanhoSchema = z.object({
  tamanho: z.string().trim().min(1, "Tamanho é obrigatório."),
  quantidade: z.coerce
    .number({ invalid_type_error: "Informe um valor." })
    .int("Use números inteiros.")
    .min(0, "Quantidade deve ser maior ou igual a zero."),
});

export type TamanhoFormValues = z.infer<typeof tamanhoSchema>;

export const entradaSchema = z.object({
  tamanhoId: z.string().min(1, "Selecione o tamanho."),
  quantidade: z.coerce
    .number({ invalid_type_error: "Informe um valor." })
    .int("Use números inteiros.")
    .positive("Quantidade deve ser maior que zero."),
});

export type EntradaFormValues = z.infer<typeof entradaSchema>;

/** Usado por entrada e saída; o motivo é exigido apenas na saída (validado no formulário). */
export const movimentacaoSchema = entradaSchema.extend({
  motivo: z.string().trim().max(200, "Máximo de 200 caracteres."),
});

export type MovimentacaoFormValues = z.infer<typeof movimentacaoSchema>;

export const promocaoSchema = z.object({
  precoPromocional: z.coerce
    .number({ invalid_type_error: "Informe um valor." })
    .positive("Preço promocional deve ser maior que zero."),
});

export type PromocaoFormValues = z.infer<typeof promocaoSchema>;
