import { z } from 'zod'

const positiveInt = z.coerce.number().int().min(0)
// Dimensao fisica: marketplaces (ML) exigem > 0 pra calcular frete. Estoque pode ser 0 (sem estoque).
const dimensionInt = z.coerce.number().int().min(1)

// Descricao de anuncio: 20 a 25 linhas (linhas nao vazias). Unica fonte desse limite —
// o prompt da IA (lib/ai/gemini.ts) e o contador do formulario leem daqui.
export const DESCRIPTION_LINES = { min: 20, max: 25 } as const

export function countDescriptionLines(description: string): number {
  return description.trim().split(/\n+/).filter((line) => line.trim().length > 0).length
}

export const descriptionLinesError = () =>
  `A descricao deve ter de ${DESCRIPTION_LINES.min} a ${DESCRIPTION_LINES.max} linhas`

const descriptionLinesCheck = z
  .string()
  .min(1)
  .refine((value) => countDescriptionLines(value) >= DESCRIPTION_LINES.min, {
    message: `A descricao deve ter no minimo ${DESCRIPTION_LINES.min} linhas`,
  })
  .refine((value) => countDescriptionLines(value) <= DESCRIPTION_LINES.max, {
    message: `A descricao deve ter no maximo ${DESCRIPTION_LINES.max} linhas`,
  })

const productBase = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  price: z.coerce.number().positive(),
  stock: positiveInt,
  weightGrams: dimensionInt,
  heightCm: dimensionInt,
  widthCm: dimensionInt,
  lengthCm: dimensionInt,
  status: z.enum(['draft', 'ready', 'published']).optional(),
})

// Create: descricao valida as linhas. Update parcial: valida so quando o campo vem.
export const productCreateSchema = productBase.extend({ description: descriptionLinesCheck })
export const productUpdateSchema = productBase.partial().extend({
  description: descriptionLinesCheck.optional(),
})

export const variationSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(255),
  stock: positiveInt,
})

export const variationUpdateSchema = variationSchema.partial()

export const imageOrderSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1),
})

export const categoryMapSchema = z.object({
  marketplace: z.enum(['mercadolivre', 'shopee']),
  categoryId: z.string().min(1),
  categoryPath: z.string().min(1),
  // valores dos atributos obrigatorios de catalogo da categoria (ex: { BRAND: 'Generica' })
  attributes: z.record(z.string(), z.string()).optional(),
})

/** Campo ausente = nao mexe; `null` = limpa o override (volta a usar o valor do Product). */
export const marketplaceSettingsSchema = z.object({
  title: z.string().min(1).max(255).nullable().optional(),
  description: descriptionLinesCheck.nullable().optional(),
  price: z.number().positive().nullable().optional(),
  // gold_special = "Classico" (comissao menor), gold_pro = "Premium" (comissao maior, mais exposicao)
  listingTypeId: z.enum(['gold_special', 'gold_pro']).nullable().optional(),
  estimatedShippingCents: z.number().int().min(0).nullable().optional(),
  // null = frete grátis (default do ML); false = por conta do comprador
  freeShipping: z.boolean().nullable().optional(),
})

/** Par chave/valor de um custom field (compartilhado por custom-fields e IA). */
export const customFieldPairSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(2000),
})

export const generateDescriptionSchema = z.object({
  title: z.string().min(1).max(255),
  weightGrams: z.number().int().min(1),
  heightCm: z.number().int().min(1),
  widthCm: z.number().int().min(1),
  lengthCm: z.number().int().min(1),
  // campos personalizados do produto — guiam a IA na descricao
  customFields: z.array(customFieldPairSchema).max(30).optional().default([]),
})

/** Body de PUT /api/products/:id/custom-fields — substitui o conjunto inteiro. */
export const customFieldsSchema = z.object({
  fields: z.array(customFieldPairSchema).max(30),
})

/** Converte o erro do zod num objeto simples `{ campo: [mensagens] }`. */
export function formatIssues(err: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    ;(result[key] ??= []).push(issue.message)
  }
  return result
}
