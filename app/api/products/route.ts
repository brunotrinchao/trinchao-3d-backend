import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { formatIssues, productCreateSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: { images: { orderBy: { position: 'asc' } }, listings: true, categoryMaps: true },
    })
    return json(products)
  } catch (err) {
    console.error('GET /api/products failed:', err)
    return error('Nao foi possivel listar os produtos', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = productCreateSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const product = await prisma.product.create({ data: parsed.data })
    return json(product, 201)
  } catch (err) {
    console.error('POST /api/products failed:', err)
    return error('Nao foi possivel criar o produto', 500)
  }
}
