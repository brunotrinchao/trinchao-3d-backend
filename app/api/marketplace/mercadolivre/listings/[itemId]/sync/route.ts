import fs from 'node:fs/promises'
import path from 'node:path'
import { error, json } from '@/lib/cors'
import {
  mlCategoryPath,
  mlGetItemDescription,
  mlGetItemRaw,
} from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { imageObjectPath, storageUpload } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { safeFilename } from '@/lib/uploads'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ itemId: string }> }

/** "HxLxC,gramas" — mesmo formato que o publish escreve. Nem todo item devolve isso na leitura.
 * Fallback: dims do PRODUTO (HEIGHT/WIDTH/LENGTH/WEIGHT attributes), depois SELLER_PACKAGE_*. */
function parseDimensions(raw: unknown, attributes?: unknown): { heightCm: number; widthCm: number; lengthCm: number; weightGrams: number } {
  if (typeof raw === 'string') {
    const match = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/)
    if (match) {
      const [, h, w, l, g] = match
      return {
        heightCm: Math.max(1, Math.round(Number(h))),
        widthCm: Math.max(1, Math.round(Number(w))),
        lengthCm: Math.max(1, Math.round(Number(l))),
        weightGrams: Math.max(1, Math.round(Number(g))),
      }
    }
  }
  // Fallback 1: dims do PRODUTO (especificações físicas)
  const fromSpecs = dimsFromProductSpecs(attributes)
  if (fromSpecs && (fromSpecs.heightCm > 0 || fromSpecs.widthCm > 0 || fromSpecs.lengthCm > 0)) return fromSpecs
  // Fallback 2: SELLER_PACKAGE_* (embalagem)
  const fromAttrs = dimensionsFromAttributes(attributes)
  if (fromAttrs.weightGrams > 1 || fromAttrs.heightCm > 1) return fromAttrs
  return { heightCm: 1, widthCm: 1, lengthCm: 1, weightGrams: 1 }
}

/** Dimensoes do PRODUTO: atributos HEIGHT/WIDTH/LENGTH/WEIGHT (especificações físicas). */
function dimsFromProductSpecs(attributes: unknown): { heightCm: number; widthCm: number; lengthCm: number; weightGrams: number } | null {
  if (!Array.isArray(attributes)) return null
  const list = attributes as Array<Record<string, unknown>>
  const numberFor = (id: string): number => {
    const attr = list.find((a) => a.id === id)
    if (!attr) return 0
    const struct = (attr?.values as Array<Record<string, unknown>> | undefined)?.[0]?.struct as
      | Record<string, unknown>
      | undefined
    const n = Number(struct?.number)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const result = {
    heightCm: numberFor('HEIGHT'),
    widthCm: numberFor('WIDTH'),
    lengthCm: numberFor('LENGTH'),
    weightGrams: numberFor('WEIGHT'),
  }
  return result.heightCm > 0 || result.widthCm > 0 || result.lengthCm > 0 ? result : null
}

/** Extrai dimensoes de embalagem dos atributos SELLER_PACKAGE_* do item ML. */
function dimensionsFromAttributes(attributes: unknown): { heightCm: number; widthCm: number; lengthCm: number; weightGrams: number } {
  const zero = { heightCm: 0, widthCm: 0, lengthCm: 0, weightGrams: 0 }
  if (!Array.isArray(attributes)) return zero
  const list = attributes as Array<Record<string, unknown>>
  const numberFor = (id: string): number => {
    const attr = list.find((a) => a.id === id)
    if (!attr) return 0
    const struct = (attr?.values as Array<Record<string, unknown>> | undefined)?.[0]?.struct as
      | Record<string, unknown>
      | undefined
    const n = Number(struct?.number)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return {
    heightCm: numberFor('SELLER_PACKAGE_HEIGHT'),
    widthCm: numberFor('SELLER_PACKAGE_WIDTH'),
    lengthCm: numberFor('SELLER_PACKAGE_LENGTH'),
    weightGrams: numberFor('SELLER_PACKAGE_WEIGHT'),
  }
}

/** Baixa as fotos do anuncio do ML e salva como ProductImage, mesma convencao do upload manual.
 * Melhor esforco: uma foto que falhar nao aborta a sincronizacao (produto ja foi criado).
 * Arquivos vao pro Supabase Storage (bucket `products`). */
async function importPictures(productId: string, pictures: unknown): Promise<number> {
  if (!Array.isArray(pictures) || pictures.length === 0) return 0

  let position = 0
  let imported = 0
  for (const raw of pictures) {
    const url = (raw as Record<string, unknown>)?.secure_url ?? (raw as Record<string, unknown>)?.url
    if (typeof url !== 'string') continue
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const ext = path.extname(new URL(url).pathname) || '.jpg'
      const filename = `${Date.now()}-${position}-${safeFilename(`ml${ext}`)}`
      const objectPath = imageObjectPath(productId, filename)
      await storageUpload(objectPath, Buffer.from(await response.arrayBuffer()))
      await prisma.productImage.create({
        data: { productId, path: objectPath, position },
      })
      position += 1
      imported += 1
    } catch (err) {
      console.error(`Falha ao importar foto do ML pro produto ${productId}:`, err)
    }
  }
  return imported
}

/** Atributos do anuncio ML que viram ProductCustomField (caracteristicas fora do schema fixo,
 * ex: "Materiais", "Marca"). Skip: sem valor textual, dimensao/peso (ja vira Product),
 * SELLER_SKU (ja vira variacao). Key = nome do atributo, value = valor preenchido no ML. */
const DIMENSION_ATTR_IDS = new Set(['HEIGHT', 'WIDTH', 'LENGTH', 'WEIGHT'])
const DIMENSION_NAME_RE = /^(altura|largura|comprimento|peso|dimensoes|medidas)\b/

function customFieldsFromAttributes(attributes: unknown): { key: string; value: string }[] {
  if (!Array.isArray(attributes)) return []
  const fields: { key: string; value: string }[] = []
  for (const raw of attributes) {
    const attr = raw as Record<string, unknown>
    const id = typeof attr.id === 'string' ? attr.id : ''
    const name = typeof attr.name === 'string' ? attr.name.trim() : ''
    const value =
      (typeof attr.value_name === 'string' && attr.value_name.trim()) ||
      ((attr.value_struct as Record<string, unknown> | undefined)?.name as string | undefined)?.trim() ||
      ''
    if (!name || !value) continue
    if (id === 'SELLER_SKU' || id.startsWith('PACKAGE_') || DIMENSION_ATTR_IDS.has(id)) continue
    const normName = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (DIMENSION_NAME_RE.test(normName) || normName.includes(' da embalagem')) continue
    fields.push({ key: name, value: value.trim() })
  }
  return fields
}

async function importCustomFields(productId: string, attributes: unknown): Promise<number> {
  const fields = customFieldsFromAttributes(attributes)
  if (fields.length === 0) return 0
  await prisma.productCustomField.createMany({
    data: fields.map((field) => ({ productId, ...field })),
    skipDuplicates: true,
  })
  return fields.length
}

/**
 * Importa um anuncio ja existente no ML (criado fora do app, ou que o usuario quer passar a
 * gerenciar por aqui) pra um Product local. Idempotente: se ja existir MarketplaceListing com
 * esse externalId, devolve o Product dele em vez de duplicar.
 */
export async function POST(_request: Request, { params }: Context) {
  const { itemId } = await params

  try {
    const credential = await getFreshMlCredential()

    const existing = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'mercadolivre', externalId: itemId },
      select: { productId: true },
    })
    if (existing) {
      // Sync = full refresh: os dados do ML sao a fonte da verdade e sobrescrevem o
      // produto local (title/descricao/preco/estoque/dimensões/categoria/fotos/campos).
      const item = await mlGetItemRaw(credential.accessToken, itemId)
      const description = await mlGetItemDescription(credential.accessToken, itemId)
      const categoryId = String(item.category_id ?? '')
      const categoryPath = categoryId ? await mlCategoryPath(categoryId) : ''

      const product = await prisma.$transaction(async (tx) => {
        // Anúncio ML sem dimensões (shipping.dimensions null) → não mexe nas locais.
        const shipping = item.shipping as Record<string, unknown> | undefined
        const rawDims = parseDimensions(shipping?.dimensions, item.attributes)
        // Fallback 1x1x1x1 = ML não tem dims → não sobrescreve as locais
        const dims = rawDims.weightGrams === 1 && rawDims.heightCm === 1 ? null : rawDims
        const listingTypeId = String(item.listing_type_id ?? '')
        const freeShipping = shipping?.free_shipping === false ? false : null
        const updated = await tx.product.update({
          where: { id: existing.productId },
          data: {
            title: String(item.title ?? ''),
            description: String(description ?? ''),
            price: Number(item.price ?? 0),
            stock: Number(item.available_quantity ?? 0),
            ...(dims ? dims : {}),
            marketplaceSettings: {
              upsert: {
                where: { productId_marketplace: { productId: existing.productId, marketplace: 'mercadolivre' } },
                create: { marketplace: 'mercadolivre', listingTypeId: listingTypeId || null, freeShipping },
                update: { listingTypeId: listingTypeId || null, freeShipping },
              },
            },
            categoryMaps: {
              upsert: {
                where: { productId_marketplace: { productId: existing.productId, marketplace: 'mercadolivre' } },
                create: { marketplace: 'mercadolivre', categoryId, categoryPath },
                update: { categoryId, categoryPath },
              },
            },
          },
          include: {
            images: { orderBy: { position: 'asc' } },
            customFields: { orderBy: { key: 'asc' } },
            listings: true,
            marketplaceSettings: true,
            categoryMaps: true,
          },
        })
        return updated
      })

      // Fotos e campos customizados: substitui o conjunto pelo estado do ML.
      const imagesImported = await importPictures(existing.productId, item.pictures)
      const customFieldsImported = await importCustomFields(existing.productId, item.attributes)

      const final = await prisma.product.findUnique({
        where: { id: existing.productId },
        include: {
          images: { orderBy: { position: 'asc' } },
          customFields: { orderBy: { key: 'asc' } },
          listings: true,
          marketplaceSettings: true,
          categoryMaps: true,
        },
      })
      return json({ product: final, alreadySynced: true, imagesImported, customFieldsImported })
    }

    const item = await mlGetItemRaw(credential.accessToken, itemId)
    const description = await mlGetItemDescription(credential.accessToken, itemId)
    const categoryId = String(item.category_id ?? '')
    const categoryPath = categoryId ? await mlCategoryPath(categoryId) : ''
    const dims = parseDimensions((item.shipping as Record<string, unknown> | undefined)?.dimensions, item.attributes)
    const listingTypeId = String(item.listing_type_id ?? '')
    const shipping = item.shipping as Record<string, unknown> | undefined
    const freeShipping = shipping?.free_shipping === false ? false : null

    // Status local deriva do item ao vivo: encerrar um anuncio remoto (auto-sync roda depois
    // de pausar/encerrar) NAO pode criar listing 'published' pra um item closed — viraria
    // card morto em /publicados.
    const localStatus = item.status === 'closed' ? 'closed' : 'published'

    const product = await prisma.product.create({
      data: {
        title: String(item.title ?? 'Sem titulo'),
        description: description || String(item.title ?? ''),
        price: Number(item.price ?? 0),
        stock: Number(item.available_quantity ?? 0),
        status: localStatus === 'closed' ? 'draft' : 'published',
        ...dims,
        categoryMaps: categoryId
          ? { create: { marketplace: 'mercadolivre', categoryId, categoryPath } }
          : undefined,
        listings: {
          create: {
            marketplace: 'mercadolivre',
            externalId: itemId,
            status: localStatus,
            publishedAt: localStatus === 'published' ? new Date() : null,
          },
        },
        marketplaceSettings: {
          create: { marketplace: 'mercadolivre', listingTypeId: listingTypeId || null, freeShipping },
        },
      },
      include: { categoryMaps: true, listings: true },
    })

    const imagesImported = await importPictures(product.id, item.pictures)
    const customFieldsImported = await importCustomFields(product.id, item.attributes)
    const images = await prisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { position: 'asc' },
    })
    const customFields = await prisma.productCustomField.findMany({
      where: { productId: product.id },
      orderBy: { key: 'asc' },
    })

    return json(
      {
        product: { ...product, images, customFields },
        alreadySynced: false,
        imagesImported,
        customFieldsImported,
        dimensionsGuessed: dims.weightGrams === 1,
      },
      201,
    )
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`POST /api/marketplace/mercadolivre/listings/${itemId}/sync failed:`, err)
    return error('Nao foi possivel sincronizar o anuncio com o app', 502)
  }
}
