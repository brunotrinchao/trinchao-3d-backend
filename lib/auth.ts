import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

/**
 * Verificação de sessão Supabase Auth: chaves assimétricas via JWKS público
 * (https://<ref>.supabase.co/auth/v1/.well-known/jwks.json) — sem secret compartilhado.
 * JWKS é cacheado pelo jose; a chamada de rede acontece só na primeira verificação.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function supabaseUrl(): string {
  const raw = process.env.SUPABASE_URL
  if (!raw) throw new Error('SUPABASE_URL nao configurado no .env')
  return raw.replace(/\/+$/, '')
}

function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`))
  return jwks
}

/** Valida o JWT da sessão Supabase. Devolve o sub (user id) ou null. */
export async function verifySupabaseToken(token: string | null): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `${supabaseUrl()}/auth/v1`,
      audience: 'authenticated',
    })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** Rotas públicas do /api: OAuth dos marketplaces (callback chega do ML/Shopee sem sessão). */
export function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/auth/')
}

export function bearerFromRequest(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7).trim() || null
}
