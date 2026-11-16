import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { shopeeGetCategories } from '@/lib/marketplace/shopee'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? undefined
  try {
    const credential = await prisma.marketplaceCredential
      .findUnique({ where: { marketplace: 'shopee' } })
      .catch(() => null)
    const shopId = credential?.shopId ?? null

    // A Shopee nao expoe taxonomia publica: sem credencial OAuth nao ha como consultar.
    if (!credential || !shopId) {
      return error(
        'Categorias da Shopee requerem autenticacao OAuth, ainda nao implementado: conecte sua conta via /api/auth/shopee primeiro',
        501,
      )
    }

    return json(await shopeeGetCategories(credential.accessToken, shopId, q || undefined))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/categories/shopee failed:', err)
    return error('Nao foi possivel consultar as categorias da Shopee', 502)
  }
}
