/** Perguntas de compradores (Questions API ML) — read + answer, live API, zero schema.
 * Filtro UNANSWERED; resposta via /answers. Mappers puros isolam o shape do ML. */

import { mlMyUserId, mlItemsByIds, mlAnswerQuestion, mlQuestionsReceived } from './mercadolivre'
import { prisma } from '@/lib/prisma'
import { storagePublicUrl } from '@/lib/storage'

export type MlQuestion = {
  id: string
  texto: string
  data: string
  comprador: string
  itemId: string
  anuncio: { titulo: string; thumbnail: string | null }
  produto: { id: string; titulo: string; thumbnail: string | null } | null
}

/** Result de /users/:id/questions/received → DTO. Campos ausentes = defaults. */
export function mapQuestion(raw: unknown): Pick<MlQuestion, 'id' | 'texto' | 'data' | 'comprador' | 'itemId'> {
  const q = (raw ?? {}) as Record<string, unknown>
  const from = (q.from ?? {}) as Record<string, unknown>
  return {
    id: String(q.id ?? ''),
    texto: String(q.text ?? ''),
    data: String(q.date_created ?? ''),
    comprador: String(from.nickname ?? ''),
    itemId: String(q.item_id ?? ''),
  }
}

/** Perguntas não respondidas do vendedor, enriquecidas com anúncio + Product local. */
export async function getUnansweredQuestions(accessToken: string): Promise<MlQuestion[]> {
  const sellerId = await mlMyUserId(accessToken)
  const data = (await mlQuestionsReceived(accessToken, sellerId)) as {
    questions?: unknown[]
  }
  const questions = (Array.isArray(data.questions) ? data.questions : []).map(mapQuestion)
  if (questions.length === 0) return []

  // Enriquecimento: título/thumbnail do anúncio (batch) + vínculo local por externalId
  const itemIds = [...new Set(questions.map((q) => q.itemId).filter(Boolean))]
  const items = itemIds.length > 0 ? await mlItemsByIds(itemIds, accessToken) : []
  const itemMap = new Map(items.map((i) => [i.id, i]))

  const listings = await prisma.marketplaceListing.findMany({
    where: { OR: [{ externalId: { in: itemIds } }, ...itemIds.map((id) => ({ externalIds: { array_contains: id } }))].filter(Boolean) },
    select: { externalId: true, externalIds: true, productId: true },
  }).catch(() => [])
  const listingToProduct = new Map<string, string>()
  for (const l of listings) {
    if (l.externalId) listingToProduct.set(l.externalId, l.productId)
    const extra = Array.isArray(l.externalIds) ? (l.externalIds as unknown[]) : []
    for (const id of extra) if (typeof id === 'string') listingToProduct.set(id, l.productId)
  }

  const productIds = [...new Set(listingToProduct.values())]
  const products = productIds.length
    ? await prisma.product
        .findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true, images: { take: 1, orderBy: { position: 'asc' } } },
        })
        .catch(() => [])
    : []
  const productMap = new Map(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        titulo: p.title,
        thumbnail: p.images[0]?.path ? storagePublicUrl(p.images[0].path) : null,
      },
    ]),
  )

  return questions.map((q) => {
    const item = itemMap.get(q.itemId)
    const produtoId = listingToProduct.get(q.itemId)
    const produto = produtoId ? (productMap.get(produtoId) ?? null) : null
    return {
      ...q,
      anuncio: {
        titulo: item?.title ?? '',
        thumbnail: item?.thumbnail ?? null,
      },
      produto,
    }
  })
}

/** Responde uma pergunta. Erros do ML (incl. já respondida) propagam com status. */
export async function answerQuestion(
  accessToken: string,
  questionId: string,
  text: string,
): Promise<void> {
  await mlAnswerQuestion(accessToken, questionId, text)
}
