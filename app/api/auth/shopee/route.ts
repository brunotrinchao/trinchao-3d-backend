import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { corsHeaders, error } from '@/lib/cors'
import { shopeeAuthorizationUrl } from '@/lib/marketplace/shopee'
import { MarketplaceError } from '@/lib/marketplace/types'
import { ensureRedirectUriHost } from '@/app/api/auth/mercadolivre/route'

export { OPTIONS } from '@/lib/cors'

export function GET(request: NextRequest) {
  try {
    // Mesmo fix do ML: cookie/estado do fluxo precisa nascer no dominio do redirect_uri.
    const hop = ensureRedirectUriHost(request, 'SHOPEE_REDIRECT_URI')
    if (hop) return hop

    return NextResponse.redirect(shopeeAuthorizationUrl(), { headers: corsHeaders() })
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/auth/shopee failed:', err)
    return error('Nao foi possivel iniciar o OAuth da Shopee', 500)
  }
}
