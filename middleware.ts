import { NextResponse, type NextRequest } from 'next/server'
import { bearerFromRequest, isPublicApiPath, verifySupabaseToken } from '@/lib/auth'

/**
 * Auth via Supabase (JWT na sessão do frontend, enviado como Bearer).
 * Público: /api/auth/* (OAuth dos marketplaces) e preflight OPTIONS.
 * /uploads fica público — as imagens são públicas no marketplace de qualquer forma.
 */
export async function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS') return NextResponse.next()

  const pathname = request.nextUrl.pathname
  if (isPublicApiPath(pathname)) return NextResponse.next()

  const userId = await verifySupabaseToken(bearerFromRequest(request))
  if (!userId) {
    return NextResponse.json(
      { error: 'Nao autenticado — faca login no app' },
      { status: 401 },
    )
  }

  // user id disponível pra handlers via header (single-user hoje; multiuser no futuro).
  const response = NextResponse.next()
  response.headers.set('x-user-id', userId)
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
