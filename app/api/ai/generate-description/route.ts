import type { NextRequest } from 'next/server'
import { generateProductDescription } from '@/lib/ai/gemini'
import { error, json } from '@/lib/cors'
import { MarketplaceError } from '@/lib/marketplace/types'
import { formatIssues, generateDescriptionSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

/** Nao depende de Product salvo — usa so o que esta no formulario (titulo + dimensoes). */
export async function POST(request: NextRequest) {
  try {
    const parsed = generateDescriptionSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const description = await generateProductDescription(parsed.data)
    return json({ description })
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('POST /api/ai/generate-description failed:', err)
    return error('Nao foi possivel gerar a descricao com IA', 502)
  }
}
