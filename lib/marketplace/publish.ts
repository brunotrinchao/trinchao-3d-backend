import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getFreshMlCredential } from './mlCredential'
import { storagePublicUrl } from '@/lib/storage'
import { MarketplaceError } from './types'

export type Marketplace = 'mercadolivre' | 'shopee'

/** Monta a descricao do ANUNCIO: descricao base + bloco de caracteristicas personalizadas.
 * Nao altera Product.description no banco — so o payload enviado ao marketplace. */
export function buildAnnouncementDescription(
  description: string,
  fields: Array<{ key: string; value: string }>,
): string {
  if (!fields.length) return description
  const lines = fields.map((field) => `- ${field.key}: ${field.value}`).join('\n')
  return `${description}\n\nCaracteristicas:\n${lines}`
}

/** Produto + relacoes necessarias para montar o payload de publicacao. */
export async function loadPublishContext(productId: string, marketplace: Marketplace) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: { orderBy: { position: 'asc' } },
      variations: true,
      categoryMaps: true,
      marketplaceSettings: true,
      customFields: true,
    },
  })
  if (!product) throw new MarketplaceError('Produto nao encontrado', 404)

  // ML: renova o token via refresh_token se tiver expirado (Shopee ainda sem refresh).
  const credential =
    marketplace === 'mercadolivre'
      ? await getFreshMlCredential()
      : await prisma.marketplaceCredential.findUnique({ where: { marketplace } })
  if (!credential) {
    throw new MarketplaceError(
      `conecte sua conta via /api/auth/${marketplace} primeiro`,
      400,
    )
  }

  const categoryMap = product.categoryMaps.find((map) => map.marketplace === marketplace)
  if (!categoryMap) {
    throw new MarketplaceError(
      `defina a categoria do produto para ${marketplace} via PUT /api/products/${productId}/category-map`,
      400,
    )
  }

  const settings = product.marketplaceSettings.find((s) => s.marketplace === marketplace) ?? null

  // Campo null/ausente no override = usa o valor compartilhado do Product.
  // Descricao do anuncio leva o bloco de caracteristicas personalizadas (o banco fica intocado).
  const effective = {
    title: settings?.title ?? product.title,
    description: buildAnnouncementDescription(
      settings?.description ?? product.description,
      product.customFields,
    ),
    price: settings?.price ?? product.price,
    listingTypeId: settings?.listingTypeId ?? 'gold_special',
    freeShipping: settings?.freeShipping !== false,
  }

  return { product, credential, categoryMap, settings, effective }
}

/** Modelo User Products: 1 item ML por variacao — externalId = item primario,
 * externalIds = todos os criados (PUT/DELETE iteram a lista). */
export function recordSuccess(
  productId: string,
  marketplace: Marketplace,
  externalId: string,
  externalIds?: string[],
) {
  const data = {
    externalId,
    // Json do Prisma: null literal nao e aceito — usa o sentinel DbNull.
    externalIds: externalIds && externalIds.length > 1 ? externalIds : Prisma.DbNull,
    status: 'published',
    errorMessage: null,
    publishedAt: new Date(),
  }
  return prisma.marketplaceListing.upsert({
    where: { productId_marketplace: { productId, marketplace } },
    create: { productId, marketplace, ...data },
    update: data,
  })
}

export function recordFailure(productId: string, marketplace: Marketplace, errorMessage: string) {
  const data = { status: 'failed', errorMessage }
  return prisma.marketplaceListing.upsert({
    where: { productId_marketplace: { productId, marketplace } },
    create: { productId, marketplace, ...data },
    update: data,
  })
}

/** URL publica de uma imagem pro payload do marketplace. Imagens no Supabase Storage
 * (`products/...`) tem URL publica direta — sem tunel, sem PUBLIC_BASE_URL. */
export function imageUrl(origin: string, relativePath: string): string {
  if (relativePath.startsWith('products/')) return storagePublicUrl(relativePath)
  return new URL(`/${relativePath.replace(/^\/+/, '')}`, origin).toString()
}
