import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { error, json } from '@/lib/cors'
import { generateAnswerSuggestion } from '@/lib/ai/gemini'
import { getProductContextForItem } from '@/lib/marketplace/questions'

export { OPTIONS } from '@/lib/cors'

const bodySchema = z.object({
  itemId: z.string().trim().min(1),
  question: z.string().trim().min(1).max(2000),
})

/** Rascunho de resposta IA (Gemini) com contexto do Product local vinculado ao
 * anúncio. Só rascunho — o vendedor edita antes de enviar. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> },
) {
  await params
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return error('Body invalido: { itemId, question }', 400)

  try {
    const product = await getProductContextForItem(body.data.itemId)
    const text = await generateAnswerSuggestion(
      body.data.question,
      product ?? { title: 'Produto impresso em 3D', description: '', customFields: [] },
    )
    return json({ text })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return error((err as Error).message, status)
    }
    console.error('POST questions/:id/suggest failed:', err)
    return error('Nao foi possivel gerar sugestao de resposta', 502)
  }
}
