import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { mlListingFee } from '@/lib/marketplace/mercadolivre'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Comissao real do ML pra um preco+categoria+tipo de anuncio (sem estimativa). */
export async function GET(request: NextRequest) {
  const price = request.nextUrl.searchParams.get('price')
  const categoryId = request.nextUrl.searchParams.get('categoryId')
  const listingTypeId = request.nextUrl.searchParams.get('listingTypeId') ?? 'gold_special'

  if (!price || !categoryId) return error('Parametros "price" e "categoryId" obrigatorios', 400)
  const priceNumber = Number(price)
  if (!Number.isFinite(priceNumber) || priceNumber <= 0) return error('"price" invalido', 400)

  try {
    const credential = await getFreshMlCredential()

    return json(await mlListingFee(credential.accessToken, priceNumber, categoryId, listingTypeId))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/fee failed:', err)
    return error('Nao foi possivel consultar a comissao do Mercado Livre', 502)
  }
}
