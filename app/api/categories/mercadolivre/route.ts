import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { mlSearchCategories } from '@/lib/marketplace/mercadolivre'
import { getFreshMlCredentialOrNull } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? undefined
  try {
    // Credencial e opcional aqui: usada como Bearer quando a conta ja foi conectada.
    const credential = await getFreshMlCredentialOrNull()

    return json(await mlSearchCategories(q || undefined, credential?.accessToken))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/categories/mercadolivre failed:', err)
    return error('Nao foi possivel consultar as categorias do Mercado Livre', 502)
  }
}
