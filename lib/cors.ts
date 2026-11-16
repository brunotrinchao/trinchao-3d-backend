import { NextResponse } from 'next/server'

const DEFAULT_ORIGIN = 'http://localhost:5173'

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Resposta JSON com CORS. Use em todas as rotas. */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders() })
}

/** Resposta de erro padronizada: `{ error: string }`. */
export function error(message: string, status = 400, extra?: unknown): NextResponse {
  return json(extra === undefined ? { error: message } : { error: message, details: extra }, status)
}

/** Adiciona os headers de CORS numa Response ja construida (ex: arquivo estatico). */
export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value)
  }
  return response
}

/** Handler de preflight reusado por todas as rotas: `export { OPTIONS } from '@/lib/cors'`. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
