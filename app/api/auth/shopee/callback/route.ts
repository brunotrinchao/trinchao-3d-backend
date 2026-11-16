import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { shopeeExchangeCode } from '@/lib/marketplace/shopee'
import { MarketplaceError } from '@/lib/marketplace/types'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const shopId = request.nextUrl.searchParams.get('shop_id')
  if (!code) return error('Parametro "code" ausente no callback', 400)
  if (!shopId) return error('Parametro "shop_id" ausente no callback', 400)

  try {
    const token = await shopeeExchangeCode(code, shopId)
    const expiresAt = token.expire_in ? new Date(Date.now() + token.expire_in * 1000) : null
    const data = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      shopId,
      expiresAt,
    }

    await prisma.marketplaceCredential.upsert({
      where: { marketplace: 'shopee' },
      create: { marketplace: 'shopee', ...data },
      update: data,
    })

    return json({ marketplace: 'shopee', connected: true, shopId, expiresAt })
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/auth/shopee/callback failed:', err)
    return error('Nao foi possivel concluir o OAuth da Shopee', 500)
  }
}
