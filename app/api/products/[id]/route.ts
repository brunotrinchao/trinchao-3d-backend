import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { resolveUploadPath } from '@/lib/uploads'
import { formatIssues, productUpdateSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        variations: true,
        categoryMaps: true,
        listings: true,
        marketplaceSettings: true,
        customFields: true,
      },
    })
    if (!product) return error('Produto nao encontrado', 404)
    return json(product)
  } catch (err) {
    console.error(`GET /api/products/${id} failed:`, err)
    return error('Nao foi possivel carregar o produto', 500)
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const parsed = productUpdateSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return error('Produto nao encontrado', 404)

    const product = await prisma.product.update({ where: { id }, data: parsed.data })
    return json(product)
  } catch (err) {
    console.error(`PUT /api/products/${id} failed:`, err)
    return error('Nao foi possivel atualizar o produto', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return error('Produto nao encontrado', 404)

    await prisma.product.delete({ where: { id } })

    const dir = resolveUploadPath(id)
    if (dir) await fs.rm(dir, { recursive: true, force: true })

    return json({ ok: true })
  } catch (err) {
    console.error(`DELETE /api/products/${id} failed:`, err)
    return error('Nao foi possivel remover o produto', 500)
  }
}
