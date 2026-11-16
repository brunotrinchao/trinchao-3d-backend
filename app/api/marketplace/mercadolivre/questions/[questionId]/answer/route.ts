import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { error, json } from '@/lib/cors'
import { answerQuestion } from '@/lib/marketplace/questions'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) })

/** Responde uma pergunta ML (POST /answers). Pergunta já respondida → 409 do ML
 * propagado; texto vazio/longo → 400 local. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return error('Body invalido: { text } (1-2000 chars)', 400)

  try {
    const credential = await getFreshMlCredential()
    await answerQuestion(credential.accessToken, questionId, body.data.text)

    return json({ ok: true })
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('POST /api/marketplace/mercadolivre/questions/:id/answer failed:', err)
    return error('Nao foi possivel responder a pergunta no Mercado Livre', 502)
  }
}
