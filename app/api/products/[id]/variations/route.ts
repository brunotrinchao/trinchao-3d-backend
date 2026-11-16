import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { formatIssues, variationSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return error('Produto nao encontrado', 404)

    const parsed = variationSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const variation = await prisma.productVariation.create({
      data: { ...parsed.data, productId: id },
    })
    return json(variation, 201)
  } catch (err) {
    console.error(`POST /api/products/${id}/variations failed:`, err)
    return error('Nao foi possivel criar a variacao', 500)
  }
}
