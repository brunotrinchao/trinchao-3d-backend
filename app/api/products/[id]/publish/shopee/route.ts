import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { imageUrl, loadPublishContext, recordFailure, recordSuccess } from '@/lib/marketplace/publish'
import { shopeeAddItem } from '@/lib/marketplace/shopee'
import { MarketplaceError } from '@/lib/marketplace/types'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params

  let context
  try {
    context = await loadPublishContext(id, 'shopee')
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`POST /api/products/${id}/publish/shopee failed:`, err)
    return error('Nao foi possivel preparar a publicacao', 500)
  }

  const { product, credential, categoryMap } = context
  const shopId = credential.shopId
  if (!shopId) return error('conecte sua conta via /api/auth/shopee primeiro', 400)

  const origin = request.nextUrl.origin
  const payload: Record<string, unknown> = {
    original_price: Number(product.price),
    description: product.description,
    item_name: product.title,
    normal_stock: product.stock,
    // A Shopee exige imagens ja hospedadas na plataforma (image_id). Enviamos as URLs
    // publicas servidas por este backend; em producao isso exige upload previo via
    // /api/v2/media_space/upload_image.
    image: { image_url_list: product.images.map((image) => imageUrl(origin, image.path)) },
    category_id: Number(categoryMap.categoryId),
    weight: product.weightGrams / 1000,
    dimension: {
      package_height: product.heightCm,
      package_width: product.widthCm,
      package_length: product.lengthCm,
    },
  }

  try {
    const item = await shopeeAddItem(credential.accessToken, shopId, payload)
    const listing = await recordSuccess(id, 'shopee', item.id)
    await prisma.product.update({ where: { id }, data: { status: 'published' } })
    return json(listing, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error(`POST /api/products/${id}/publish/shopee failed:`, err)
    const listing = await recordFailure(id, 'shopee', message)
    return json({ error: message, listing }, err instanceof MarketplaceError ? err.status : 502)
  }
}
