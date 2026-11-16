import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { mlRequiredCatalogAttributes } from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get('categoryId')
  if (!categoryId) return error('Parametro "categoryId" ausente', 400)

  try {
    return json(await mlRequiredCatalogAttributes(categoryId))  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/categories/mercadolivre/attributes failed:', err)
    return error('Nao foi possivel consultar os atributos da categoria', 502)
  }
}
