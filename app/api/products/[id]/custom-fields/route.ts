import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { customFieldsSchema, formatIssues } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

/** PUT substitui o conjunto inteiro de campos customizados do produto (delete + create na
 * mesma transacao). Corpo: `{ fields: [{ key, value }] }` — lista vazia remove todos. */
export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  try {
    const parsed = customFieldsSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return error('Produto nao encontrado', 404)

    const { fields } = parsed.data
    const saved = await prisma.$transaction(async (tx) => {
      await tx.productCustomField.deleteMany({ where: { productId: id } })
      if (fields.length === 0) return []
      // createManyAndReturn nao existe no MySQL — grava em lote e devolve o conjunto salvo.
      await tx.productCustomField.createMany({
        data: fields.map((field) => ({ productId: id, key: field.key, value: field.value })),
      })
      return tx.productCustomField.findMany({
        where: { productId: id },
        orderBy: { key: 'asc' },
      })
    })
    return json(saved)
  } catch (err) {
    console.error(`PUT /api/products/${id}/custom-fields failed:`, err)
    return error('Nao foi possivel salvar os campos do produto', 500)
  }
}
