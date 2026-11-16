import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { mlMyUserId, mlShippingQuotes } from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

/** Cotações de envio ME2 (pré-venda) via GET /users/{userId}/shipping_options/free.
 * Dois modos:
 * - `?itemId=MLB...` — anúncio já publicado no ML (mais coerente, docs recomendam item_id)
 * - `?productId=...`  — produto local ainda sem anúncio: usa dimensões do Product + preço
 *   efetivo (override ou do Product) + listing_type; sem isso a cotação volta list_cost=0.
 * Retorna as opções com cost (com desconto) e list_cost (custo cheio, o que o vendedor
 * paga no frete grátis). */
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get('productId')
  const itemId = request.nextUrl.searchParams.get('itemId')

  if (!productId && !itemId) {
    return error('Passe "productId" (produto local) ou "itemId" (anúncio ML)', 400)
  }

  try {
    const credential = await getFreshMlCredential()

    const query: Record<string, string> = { verbose: 'true' }

    if (itemId) {
      query.item_id = itemId
    } else {
      const product = await prisma.product.findUnique({
        where: { id: productId! },
        include: { marketplaceSettings: true, categoryMaps: true },
      })
      if (!product) return error('Produto nao encontrado', 404)
      if (product.heightCm <= 0 || product.widthCm <= 0 || product.lengthCm <= 0 || product.weightGrams <= 0) {
        return error('Produto com dimensao fisica invalida (precisa > 0)', 422)
      }

      const settings = product.marketplaceSettings.find((s) => s.marketplace === 'mercadolivre') ?? null
      const price = Number(settings?.price ?? product.price)
      const listingTypeId = settings?.listingTypeId ?? 'gold_special'
      const categoryId = product.categoryMaps.find((c) => c.marketplace === 'mercadolivre')?.categoryId

      // Formato docs: "alturaxlarguraxcomprimento,pesoEmGramas" (gramas inteiro)
      query.dimensions = `${product.heightCm}x${product.widthCm}x${product.lengthCm},${product.weightGrams}`
      query.item_price = String(price)
      query.listing_type_id = listingTypeId
      query.mode = 'me2'
      query.condition = 'new'
      query.logistic_type = 'drop_off'
      query.free_shipping = 'true'
      query.currency_id = 'BRL'
      if (categoryId) query.category_id = categoryId
    }

    const userId = await mlMyUserId(credential.accessToken)
    const options = await mlShippingQuotes(credential.accessToken, userId, query)
    return json({ options })
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/shipping-costs failed:', err)
    return error('Nao foi possivel consultar os custos de envio do Mercado Livre', 502)
  }
}
