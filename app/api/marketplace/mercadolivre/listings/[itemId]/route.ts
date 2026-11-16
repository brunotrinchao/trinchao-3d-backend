import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import {
  mlDeleteItem,
  mlGetListingDetail,
  mlUpdateItem,
  mlUpdateItemDescription,
} from '@/lib/marketplace/mercadolivre'
import { imageUrl } from '@/lib/marketplace/publish'
import { MarketplaceError } from '@/lib/marketplace/types'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ itemId: string }> }

const VALID_STATUS = new Set(['active', 'paused', 'closed'])

async function getCredentialOrError() {
  return getFreshMlCredential()
}

/** Ids que compoem o anuncio: o itemId da URL + os demais do listing local (modelo
 * User Products cria 1 item ML por variacao). Sem listing local: so o proprio itemId. */
async function allItemIds(itemId: string): Promise<string[]> {
  const listing = await prisma.marketplaceListing.findFirst({
    where: { marketplace: 'mercadolivre', externalId: itemId },
    select: { externalIds: true },
  })
  const extra = Array.isArray(listing?.externalIds)
    ? (listing?.externalIds as unknown[]).map(String).filter((id) => id && id !== itemId)
    : []
  return [...new Set([itemId, ...extra])]
}

/** Reflete no listing local o estado do anuncio ML (sync sob demanda — acao explicita do
 * usuario). Anuncio sem Product local (remoto): nada pra atualizar. Best-effort: o ML ja
 * foi mutado quando isso roda — falha de DB aqui nao pode mascarar o resultado real da acao. */
async function reflectListingStatus(itemId: string, localStatus: 'published' | 'closed' | 'deleted') {
  try {
    const listing = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'mercadolivre', externalId: itemId },
      select: { id: true },
    })
    if (listing) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: localStatus },
      })
    }
  } catch (err) {
    console.error(`reflectListingStatus(${itemId}, ${localStatus}) failed (best-effort):`, err)
  }
}

/** Detalhe completo (descricao, dimensoes, fotos) — usado pelo modal de edicao. */
export async function GET(_request: NextRequest, { params }: Context) {
  const { itemId } = await params
  try {
    const credential = await getCredentialOrError()
    return json(await mlGetListingDetail(credential.accessToken, itemId))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`GET /api/marketplace/mercadolivre/listings/${itemId} failed:`, err)
    return error('Nao foi possivel consultar o anuncio no Mercado Livre', 502)
  }
}

/** Edicao direta no anuncio do ML — nao toca em nenhum Product/MarketplaceListing local. */
export async function PUT(request: NextRequest, { params }: Context) {
  const { itemId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error('Corpo invalido: envie JSON', 400)
  }

  const {
    title,
    price,
    availableQuantity,
    status,
    description,
    heightCm,
    widthCm,
    lengthCm,
    weightGrams,
    freeShipping,
    syncPicturesFromProduct,
    pictureIds,
  } = (body as Record<string, unknown>) ?? {}

  const payload: Record<string, unknown> = {}
  if (title !== undefined) payload.title = title
  if (price !== undefined) payload.price = price
  if (availableQuantity !== undefined) payload.available_quantity = availableQuantity
  if (status !== undefined) {
    if (typeof status !== 'string' || !VALID_STATUS.has(status)) {
      return error('status invalido: use active, paused ou closed', 400)
    }
    payload.status = status
  }
  if (
    heightCm !== undefined &&
    widthCm !== undefined &&
    lengthCm !== undefined &&
    weightGrams !== undefined
  ) {
    payload.shipping = { dimensions: `${heightCm}x${widthCm}x${lengthCm},${weightGrams}` }
  }

  // Frete gratis editavel no modal — ML aceita shipping parcial no PUT.
  if (freeShipping !== undefined) {
    if (typeof freeShipping !== 'boolean') {
      return error('freeShipping invalido: envie boolean', 400)
    }
    const shipping = (payload.shipping as Record<string, unknown> | undefined) ?? {}
    shipping.free_shipping = freeShipping
    payload.shipping = shipping
  }

  if (pictureIds !== undefined) {
    if (!Array.isArray(pictureIds) || !pictureIds.every((id) => typeof id === 'string')) {
      return error('pictureIds invalido: envie array de strings', 400)
    }
    if (pictureIds.length === 0) return error('pictureIds nao pode ser vazio — exclua o anuncio pra isso', 400)
    payload.pictures = pictureIds.map((id) => ({ id }))
  }

  if (
    Object.keys(payload).length === 0 &&
    description === undefined &&
    !syncPicturesFromProduct
  ) {
    return error('Nada para atualizar', 400)
  }

  try {
    const credential = await getCredentialOrError()

    if (typeof description === 'string') {
      // Descricao nao sincroniza entre itens de um UP — aplica em todos.
      for (const idItem of await allItemIds(itemId)) {
        try {
          await mlUpdateItemDescription(credential.accessToken, idItem, description)
        } catch (err) {
          if (idItem === itemId) throw err
          console.error(`PUT description ${idItem} failed (secondary):`, err)
        }
      }
    }

    if (syncPicturesFromProduct === true) {
      const listing = await prisma.marketplaceListing.findFirst({
        where: { marketplace: 'mercadolivre', externalId: itemId },
        include: { product: { include: { images: { orderBy: { position: 'asc' } } } } },
      })
      if (!listing) {
        return error('Esse anuncio nao tem Product local vinculado — sincronize primeiro', 400)
      }
      if (listing.product.images.length === 0) {
        return error('Produto local nao tem fotos cadastradas ainda', 400)
      }
      const origin = process.env.PUBLIC_BASE_URL || request.nextUrl.origin
      payload.pictures = listing.product.images.map((image) => ({ source: imageUrl(origin, image.path) }))
    }

    if (Object.keys(payload).length === 0) {
      return json(await mlGetListingDetail(credential.accessToken, itemId))
    }
    // Aplica em todos os itens do anuncio (UP = 1 item por variacao). Falha no primario
    // propaga; falha em item secundario so registra (titulo/fotos/atributos sincronizam
    // sozinhos entre itens do mesmo UP — price/estoque nao).
    const ids = await allItemIds(itemId)
    let last: unknown = null
    for (const idItem of ids) {
      try {
        last = await mlUpdateItem(credential.accessToken, idItem, payload)
      } catch (err) {
        if (idItem === itemId) throw err
        console.error(`PUT ${idItem} failed (secondary):`, err)
      }
    }
    // Status mudou no ML: espelha no listing local (closed pausa a contagem de "publicado").
    if (payload.status) {
      await reflectListingStatus(itemId, payload.status === 'closed' ? 'closed' : 'published')
    }
    return json(last)
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`PUT /api/marketplace/mercadolivre/listings/${itemId} failed:`, err)
    return error('Nao foi possivel atualizar o anuncio no Mercado Livre', 502)
  }
}

/** Exclusao irreversivel (fecha + marca deleted no ML). Nao tem volta. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  const { itemId } = await params

  try {
    const credential = await getCredentialOrError()
    // Exclusao irreversivel em todos os itens do anuncio (UP = 1 item por variacao).
    const ids = await allItemIds(itemId)
    let last: unknown = null
    for (const idItem of ids) {
      try {
        last = await mlDeleteItem(credential.accessToken, idItem)
      } catch (err) {
        if (idItem === itemId) throw err
        console.error(`DELETE ${idItem} failed (secondary):`, err)
      }
    }
    await reflectListingStatus(itemId, 'deleted')
    return json(last)
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`DELETE /api/marketplace/mercadolivre/listings/${itemId} failed:`, err)
    return error('Nao foi possivel excluir o anuncio no Mercado Livre', 502)
  }
}
