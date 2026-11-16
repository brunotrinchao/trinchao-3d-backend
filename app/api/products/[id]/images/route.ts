import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { imageObjectPath, storageUpload } from '@/lib/storage'
import { safeFilename } from '@/lib/uploads'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

/** Upload multipart. Campo esperado: `images` (pode repetir); `image`/`file` tambem aceitos.
 * Arquivos vão pro Supabase Storage (bucket `products`) — disco não existe em serverless. */
export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return error('Produto nao encontrado', 404)

    const form = await request.formData()
    const files = [...form.getAll('images'), ...form.getAll('image'), ...form.getAll('file')].filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    )
    if (files.length === 0) return error('Nenhum arquivo enviado no campo "images"', 422)

    const lastImage = await prisma.productImage.findFirst({
      where: { productId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    let position = (lastImage?.position ?? -1) + 1

    const created = []
    for (const file of files) {
      const filename = `${Date.now()}-${position}-${safeFilename(file.name || 'image')}`
      const objectPath = imageObjectPath(id, filename)
      await storageUpload(objectPath, Buffer.from(await file.arrayBuffer()))
      created.push(
        await prisma.productImage.create({
          data: { productId: id, path: objectPath, position },
        }),
      )
      position += 1
    }

    return json(created, 201)
  } catch (err) {
    console.error(`POST /api/products/${id}/images failed:`, err)
    return error('Nao foi possivel salvar as imagens', 500)
  }
}
