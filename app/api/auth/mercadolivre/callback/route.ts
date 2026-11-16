import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { ML_PKCE_COOKIE } from '@/app/api/auth/mercadolivre/route'
import { mlExchangeCode } from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return error('Parametro "code" ausente no callback', 400)

  const codeVerifier = request.cookies.get(ML_PKCE_COOKIE)?.value
  if (!codeVerifier) {
    return error('code_verifier ausente ou expirado: reinicie o fluxo em /api/auth/mercadolivre', 400)
  }

  try {
    const token = await mlExchangeCode(code, codeVerifier)
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null
    const data = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
    }

    await prisma.marketplaceCredential.upsert({
      where: { marketplace: 'mercadolivre' },
      create: { marketplace: 'mercadolivre', ...data },
      update: data,
    })

    const response = json({ marketplace: 'mercadolivre', connected: true, expiresAt })
    response.cookies.delete(ML_PKCE_COOKIE)
    return response
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/auth/mercadolivre/callback failed:', err)
    return error('Nao foi possivel concluir o OAuth do Mercado Livre', 500)
  }
}
