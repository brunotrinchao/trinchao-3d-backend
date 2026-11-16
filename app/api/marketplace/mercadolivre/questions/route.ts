import { error, json } from '@/lib/cors'
import { getUnansweredQuestions } from '@/lib/marketplace/questions'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Perguntas não respondidas (read-only, live API). Enriquecidas com anúncio
 * e Product local vinculado — respostas dão contexto pro vendedor. */
export async function GET() {
  try {
    const credential = await getFreshMlCredential()

    return json(await getUnansweredQuestions(credential.accessToken))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/questions failed:', err)
    return error('Nao foi possivel consultar as perguntas no Mercado Livre', 502)
  }
}
