import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { corsHeaders, error } from '@/lib/cors'
import { contentTypeFor, resolveUploadPath } from '@/lib/uploads'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ productId: string; filename: string }> }

/** Serve o arquivo gravado em `backend/uploads/<productId>/<filename>`. */
export async function GET(_request: NextRequest, { params }: Context) {
  const { productId, filename } = await params

  const absolute = resolveUploadPath(productId, filename)
  if (!absolute) return error('Caminho invalido', 400)

  try {
    const file = await fs.readFile(absolute)
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': contentTypeFor(filename),
        'Content-Length': String(file.byteLength),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return error('Arquivo nao encontrado', 404)
  }
}
