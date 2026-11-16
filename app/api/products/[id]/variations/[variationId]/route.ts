import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { formatIssues, variationUpdateSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string; variationId: string }> }

export async function PUT(request: NextRequest, { params }: Context) {
  const { id, variationId } = await params
  try {
    const existing = await prisma.productVariation.findUnique({ where: { id: variationId } })
    if (!existing || existing.productId !== id) return error('Variacao nao encontrada', 404)

    const parsed = variationUpdateSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const variation = await prisma.productVariation.update({
      where: { id: variationId },
      data: parsed.data,
    })
    return json(variation)
  } catch (err) {
    console.error(`PUT /api/products/${id}/variations/${variationId} failed:`, err)
    return error('Nao foi possivel atualizar a variacao', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id, variationId } = await params
  try {
    const existing = await prisma.productVariation.findUnique({ where: { id: variationId } })
    if (!existing || existing.productId !== id) return error('Variacao nao encontrada', 404)

    await prisma.productVariation.delete({ where: { id: variationId } })
    return json({ ok: true })
  } catch (err) {
    console.error(`DELETE /api/products/${id}/variations/${variationId} failed:`, err)
    return error('Nao foi possivel remover a variacao', 500)
  }
}
