import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { formatIssues, imageOrderSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

/** Recebe a lista de imageIds na ordem desejada e grava `position` (0..n-1) de cada uma. */
export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const parsed = imageOrderSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const existing = await prisma.productImage.findMany({ where: { productId: id } })
    const existingIds = new Set(existing.map((image) => image.id))
    const { imageIds } = parsed.data

    if (imageIds.length !== existing.length || !imageIds.every((imageId) => existingIds.has(imageId))) {
      return error('imageIds deve conter exatamente as imagens atuais do produto, sem repetir', 422)
    }

    await prisma.$transaction(
      imageIds.map((imageId, position) =>
        prisma.productImage.update({ where: { id: imageId }, data: { position } }),
      ),
    )

    const images = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { position: 'asc' },
    })
    return json(images)
  } catch (err) {
    console.error(`PUT /api/products/${id}/images/order failed:`, err)
    return error('Nao foi possivel reordenar as imagens', 500)
  }
}
