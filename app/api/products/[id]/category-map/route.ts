import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { categoryMapSchema, formatIssues } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return error('Produto nao encontrado', 404)

    const parsed = categoryMapSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const { marketplace, categoryId, categoryPath, attributes } = parsed.data
    const categoryMap = await prisma.productCategoryMap.upsert({
      where: { productId_marketplace: { productId: id, marketplace } },
      create: { productId: id, marketplace, categoryId, categoryPath, attributes },
      update: { categoryId, categoryPath, attributes },
    })
    return json(categoryMap)
  } catch (err) {
    console.error(`PUT /api/products/${id}/category-map failed:`, err)
    return error('Nao foi possivel salvar o mapeamento de categoria', 500)
  }
}
