import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { formatIssues, marketplaceSettingsSchema } from '@/lib/validation'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string; marketplace: string }> }

const VALID_MARKETPLACES = new Set(['mercadolivre', 'shopee'])

/** Upsert dos dados que podem ser diferentes por marketplace (titulo/preco/descricao/tipo de
 * anuncio/frete estimado). Campo enviado como `null` limpa o override (volta a usar o Product). */
export async function PUT(request: NextRequest, { params }: Context) {
  const { id, marketplace } = await params
  if (!VALID_MARKETPLACES.has(marketplace)) return error('Marketplace invalido', 400)

  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return error('Produto nao encontrado', 404)

    const parsed = marketplaceSettingsSchema.safeParse(await request.json())
    if (!parsed.success) return error('Dados invalidos', 422, formatIssues(parsed.error))

    const settings = await prisma.productMarketplaceSettings.upsert({
      where: { productId_marketplace: { productId: id, marketplace } },
      create: { productId: id, marketplace, ...parsed.data },
      update: parsed.data,
    })
    return json(settings)
  } catch (err) {
    console.error(`PUT /api/products/${id}/marketplace-settings/${marketplace} failed:`, err)
    return error('Nao foi possivel salvar as configuracoes do marketplace', 500)
  }
}
