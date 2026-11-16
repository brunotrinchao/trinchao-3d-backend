import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import {
  mlCategoryAttributes,
  mlCreateItem,
  mlCreateItemDescription,
  mlUserTags,
} from '@/lib/marketplace/mercadolivre'
import { imageUrl, loadPublishContext, recordFailure, recordSuccess } from '@/lib/marketplace/publish'
import { MarketplaceError } from '@/lib/marketplace/types'
import { prisma } from '@/lib/prisma'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ id: string }> }

/** Normaliza nomes pra casar campo customizado com atributo ML: maiusculas, sem acento,
 * espacos colapsados, com variantes de plural portugues (MATERIAIS~MATERIAL, CORREES~CORRECAO). */
function nameVariants(name: string): string[] {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
  const variants = [base]
  if (base.endsWith('OES')) variants.push(`${base.slice(0, -3)}AO`)
  if (base.endsWith('AES')) variants.push(`${base.slice(0, -3)}AO`)
  if (base.endsWith('ES')) variants.push(base.slice(0, -2))
  if (base.endsWith('S')) variants.push(base.slice(0, -1))
  return [...new Set(variants)]
}

/** Convenção do formulário: "Cor: Azul / Tamanho: M" -> [["Cor","Azul"],["Tamanho","M"]].
 * Segmentos fora do formato "chave: valor" são ignorados. */
function parseVariationName(name: string): Array<[string, string]> {
  return name
    .split('/')
    .map((part) => {
      const idx = part.indexOf(':')
      if (idx <= 0) return null
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1).trim()
      return key && value ? ([key, value] as [string, string]) : null
    })
    .filter((pair): pair is [string, string] => pair !== null)
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params

  let context
  try {
    context = await loadPublishContext(id, 'mercadolivre')
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`POST /api/products/${id}/publish/mercadolivre failed:`, err)
    return error('Nao foi possivel preparar a publicacao', 500)
  }

  const { product, credential, categoryMap, effective } = context

  if (product.weightGrams <= 0 || product.heightCm <= 0 || product.widthCm <= 0 || product.lengthCm <= 0) {
    return error(
      'Produto com dimensao fisica invalida (peso/altura/largura/comprimento precisam ser > 0): edite o produto antes de publicar',
      422,
    )
  }

  const attributeValues = (categoryMap.attributes as Record<string, string> | null) ?? {}
  let catalogAttributes: Record<string, unknown>[] = []
  // Atributos da categoria que definem variacao de verdade (tag allow_variations: COLOR, SIZE...)
  let variationAttrs: Array<{ id: string; name: string }> = []

  try {
    const categoryAttrs = await mlCategoryAttributes(categoryMap.categoryId)
    const required = categoryAttrs.filter((attr) => attr.catalogRequired)

    // Campos customizados do produto viram atributos do anuncio quando casam com um atributo
    // da categoria pelo nome (sem acento/caixa, tolerando plural — ex: "Materiais" -> MATERIAL).
    // Roda ANTES do check de faltantes: "Marca"/"Material" nos campos personalizados satisfazem
    // atributos catalog_required da categoria (mesma satisfacao do card de Categorias).
    const attrVariants = categoryAttrs.map((attr) => ({ attr, variants: nameVariants(attr.name) }))
    const satisfied = new Set<string>()
    const fieldSourced: Record<string, string> = {}
    for (const field of product.customFields) {
      const fieldVariants = nameVariants(field.key)
      const match = attrVariants.find(
        ({ variants }) => variants.some((v) => fieldVariants.includes(v)),
      )
      if (!match || satisfied.has(match.attr.id)) continue
      satisfied.add(match.attr.id)
      fieldSourced[match.attr.id] = field.value
    }

    const missing = required.filter((attr) => !attributeValues[attr.id]?.trim() && !fieldSourced[attr.id]?.trim())
    if (missing.length > 0) {
      const names = missing.map((attr) => `${attr.name} (${attr.id})`).join(', ')
      return error(
        `Categoria "${categoryMap.categoryPath}" exige atributos de catalogo ainda nao preenchidos: ${names}. Preencha no card de Categorias ou nos campos personalizados do produto antes de publicar.`,
        422,
      )
    }
    catalogAttributes = required.map((attr) => ({
      id: attr.id,
      value_name: attributeValues[attr.id]?.trim() || fieldSourced[attr.id],
    }))

    // Outros atributos casados (não-required) continuam entrando como attributes do anuncio.
    const usedIds = new Set(catalogAttributes.map((attr) => String(attr.id)))
    for (const field of product.customFields) {
      const fieldVariants = nameVariants(field.key)
      const match = attrVariants.find(
        ({ variants }) => variants.some((v) => fieldVariants.includes(v)),
      )
      if (!match || usedIds.has(match.attr.id)) continue
      usedIds.add(match.attr.id)
      catalogAttributes.push({ id: match.attr.id, value_name: field.value })
    }
    variationAttrs = categoryAttrs.filter((attr) => attr.allowVariations)
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`POST /api/products/${id}/publish/mercadolivre failed:`, err)
    return error('Nao foi possivel consultar os atributos da categoria no Mercado Livre', 502)
  }

  const origin = process.env.PUBLIC_BASE_URL || request.nextUrl.origin
  // Categoria com atributos de catalogo (BRAND/MODEL/...) exige `family_name` no lugar de
  // `title` — o ML usa o par categoria+atributos pra casar com um produto de catalogo.
  const usesCatalog = catalogAttributes.length > 0

  const payload: Record<string, unknown> = {
    ...(usesCatalog ? { family_name: effective.title } : { title: effective.title }),
    category_id: categoryMap.categoryId,
    price: Number(effective.price),
    currency_id: 'BRL',
    available_quantity: product.stock,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: effective.listingTypeId,
    // Descrição NÃO vai aqui: desde 2021 o POST /items ignora/rejeita o campo — envia em
    // 2º passo via POST /items/:id/description (ver docs de publicação de produtos).
    pictures: product.images.map((image) => ({ source: imageUrl(origin, image.path) })),
    // Formato exigido pelo ML: "alturaXlarguraXcomprimento,pesoEmGramas". Atributos soltos tipo
    // PACKAGE_HEIGHT/WEIGHT sao rejeitados ("not modifiable") em varias categorias.
    shipping: {
      dimensions: `${product.heightCm}x${product.widthCm}x${product.lengthCm},${product.weightGrams}`,
      // null = frete grátis (default do ML); false = por conta do comprador.
      // docs: se a categoria tem tag mandatory_free_shipping, o ML ignora free_shipping=false.
      free_shipping: effective.freeShipping,
    },
    ...(usesCatalog ? { attributes: catalogAttributes } : {}),
  }

  if (product.variations.length > 0) {
    // Docs: max_variations_allowed = 100 na maioria das categorias (250 so em moda/autopartes).
    if (product.variations.length > 100) {
      return error('O Mercado Livre permite no maximo 100 variacoes por anuncio', 422)
    }

    // Tag user_product_seller = modelo User Products: `variations[]` (modelo antigo) e
    // rejeitado — publica 1 item por variacao na mesma familia (family_name + attributes).
    const upModel = (await mlUserTags(credential.accessToken).catch(() => [] as string[])).includes(
      'user_product_seller',
    )

    if (upModel) {
      const combosFor = (name: string) =>
        parseVariationName(name)
          .map(([key, value]) => {
            const keyVariants = nameVariants(key)
            const match = variationAttrs.find(({ name }) => {
              const attrVariants = nameVariants(name)
              return keyVariants.some((k) => attrVariants.includes(k))
            })
            return match ? { id: match.id, value_name: value } : null
          })
          .filter((combo): combo is { id: string; value_name: string } => combo !== null)

      const items: string[] = []
      let descriptionWarning: string | null = null
      try {
        for (const variation of product.variations) {
          const item = await mlCreateItem(credential.accessToken, {
            // No modelo UP o family_name identifica o produto pai; title+family_name juntos
            // e rejeitado (mesma regra do catalogo).
            family_name: effective.title,
            category_id: categoryMap.categoryId,
            price: Number(effective.price),
            currency_id: 'BRL',
            available_quantity: variation.stock,
            buying_mode: 'buy_it_now',
            condition: 'new',
            listing_type_id: effective.listingTypeId,
            pictures: product.images.map((image) => ({ source: imageUrl(origin, image.path) })),
            shipping: {
              dimensions: `${product.heightCm}x${product.widthCm}x${product.lengthCm},${product.weightGrams}`,
              free_shipping: effective.freeShipping,
            },
            attributes: [
              ...catalogAttributes,
              ...combosFor(variation.name),
              // Docs: SKU carrega em attributes SELLER_SKU, nunca em seller_custom_field.
              { id: 'SELLER_SKU', value_name: variation.sku },
            ],
          })
          items.push(item.id)
          // Descricao e 2o passo por item (nao sincroniza entre UPs).
          try {
            await mlCreateItemDescription(credential.accessToken, item.id, effective.description)
          } catch (err) {
            descriptionWarning ??= err instanceof Error ? err.message : 'Falha ao salvar a descricao de um anuncio'
            console.error(`publish UP description for ${item.id} failed:`, err)
          }
        }
        const listing = await recordSuccess(id, 'mercadolivre', items[0], items)
        await prisma.product.update({ where: { id }, data: { status: 'published' } })
        return json({ ...listing, externalIds: items, descriptionWarning }, 201)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        // Publicacao parcial: falha no meio do loop deixa itens criados no ML sem listing local.
        const partial =
          items.length > 0
            ? ` Ja foram criados ${items.length} anuncio(s) no ML (${items.join(', ')}) — encerre-os no painel do ML antes de tentar de novo.`
            : ''
        console.error(`POST /api/products/${id}/publish/mercadolivre UP failed:`, err)
        const listing = await recordFailure(id, 'mercadolivre', message + partial)
        return json({ error: message + partial, listing }, err instanceof MarketplaceError ? err.status : 502)
      }
    }

    // Modelo antigo: combinations reais quando TODAS as variacoes mapeiam atributos
    // allow_variations; fallback SELLER_SKU (aproximacao) quando nao.
    const mapped = product.variations.map((variation) => {
      const combos = parseVariationName(variation.name)
        .map(([key, value]) => {
          const keyVariants = nameVariants(key)
          const match = variationAttrs.find(({ name }) => {
            const attrVariants = nameVariants(name)
            return keyVariants.some((k) => attrVariants.includes(k))
          })
          return match ? { id: match.id, value_name: value } : null
        })
        .filter((combo): combo is { id: string; value_name: string } => combo !== null)
      return { variation, combos }
    })
    const allMapped = mapped.every(({ combos }) => combos.length > 0)
    payload.variations = mapped.map(({ variation, combos }) => ({
      price: Number(effective.price),
      available_quantity: variation.stock,
      attribute_combinations: allMapped
        ? combos
        : [{ id: 'SELLER_SKU', value_name: variation.name }],
      attributes: [{ id: 'SELLER_SKU', value_name: variation.sku }],
    }))
  }

  try {
    const item = await mlCreateItem(credential.accessToken, payload)
    // Item já está criado: falha na descrição não desfaz a publicação — registra o aviso.
    let descriptionWarning: string | null = null
    try {
      await mlCreateItemDescription(credential.accessToken, item.id, effective.description)
    } catch (err) {
      descriptionWarning = err instanceof Error ? err.message : 'Falha ao salvar a descrição do anúncio'
      console.error(`POST /api/products/${id}/publish/mercadolivre description failed:`, err)
    }
    const listing = await recordSuccess(id, 'mercadolivre', item.id)
    await prisma.product.update({ where: { id }, data: { status: 'published' } })
    return json({ ...listing, descriptionWarning }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error(`POST /api/products/${id}/publish/mercadolivre failed:`, err)
    const listing = await recordFailure(id, 'mercadolivre', message)
    return json({ error: message, listing }, err instanceof MarketplaceError ? err.status : 502)
  }
}
