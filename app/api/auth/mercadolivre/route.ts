import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { corsHeaders, error } from '@/lib/cors'
import {
  codeChallengeFromVerifier,
  generateCodeVerifier,
  mlAuthorizationUrl,
} from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

export const ML_PKCE_COOKIE = 'ml_pkce_verifier'

/** O cookie do PKCE fica no dominio onde o fluxo comeca. O callback do ML chega no dominio
 * do MERCADOLIVRE_REDIRECT_URI (ex: tunel ngrok) — se o usuario clicar "Conectar/Reconectar"
 * a partir de outro host (localhost em dev), o cookie nao chega no callback ("code_verifier
 * ausente ou expirado"). Fix: 1o hop redireciona pro host do redirect_uri, que entao seta o
 * cookie e segue pro ML. Mesma URL publica do redirect_uri, sempre. */
export function ensureRedirectUriHost(request: NextRequest, envName: string): NextResponse | null {
  const raw = process.env[envName]
  if (!raw) return null
  const redirect = new URL(raw)
  const requestHost = request.headers.get('host')
  if (!requestHost || requestHost === redirect.host) return null
  return NextResponse.redirect(new URL(request.nextUrl.pathname, redirect.origin), 302)
}

export function GET(request: NextRequest) {
  try {
    const hop = ensureRedirectUriHost(request, 'MERCADOLIVRE_REDIRECT_URI')
    if (hop) return hop

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = codeChallengeFromVerifier(codeVerifier)
    const response = NextResponse.redirect(mlAuthorizationUrl(codeChallenge), {
      headers: corsHeaders(),
    })
    response.cookies.set(ML_PKCE_COOKIE, codeVerifier, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    })
    return response
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/auth/mercadolivre failed:', err)
    return error('Nao foi possivel iniciar o OAuth do Mercado Livre', 500)
  }
}
