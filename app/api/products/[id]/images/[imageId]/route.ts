import fs from 'node:fs/promises'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { UPLOADS_ROOT } from '@/lib/uploads'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string; imageId: string }> }

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id, imageId } = await params
  try {
    const image = await prisma.productImage.findUnique({ where: { id: imageId } })
    if (!image || image.productId !== id) return error('Imagem nao encontrada', 404)

    // `image.path` sempre tem a forma `uploads/<productId>/<file>` (gravada por esta API).
    const absolute = path.resolve(UPLOADS_ROOT, '..', image.path)
    if (absolute.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) {
      await fs.rm(absolute, { force: true })
    }

    await prisma.productImage.delete({ where: { id: imageId } })
    return json({ ok: true })
  } catch (err) {
    console.error(`DELETE /api/products/${id}/images/${imageId} failed:`, err)
    return error('Nao foi possivel remover a imagem', 500)
  }
}
