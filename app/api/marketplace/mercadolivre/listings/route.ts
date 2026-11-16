import { error, json } from '@/lib/cors'
import { mlMyListings } from '@/lib/marketplace/mercadolivre'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

export async function GET() {
  try {
    const credential = await getFreshMlCredential()

    return json(await mlMyListings(credential.accessToken))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/listings failed:', err)
    return error('Nao foi possivel consultar os anuncios do Mercado Livre', 502)
  }
}
