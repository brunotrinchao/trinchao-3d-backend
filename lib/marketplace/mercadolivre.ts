import { createHash, randomBytes } from 'node:crypto'
import { MarketplaceError, type CategoryOption } from './types'

export const ML_API = 'https://api.mercadolibre.com'
export const ML_AUTH = 'https://auth.mercadolivre.com.br/authorization'
/** Site fixo: Brasil. */
export const ML_SITE_ID = 'MLB'

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PKCE: ML passou a exigir code_challenge/code_verifier (RFC 7636) desde 2024. */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32))
}

export function codeChallengeFromVerifier(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

export type MlTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new MarketplaceError(`${name} nao configurado no .env`, 500)
  return value
}

export function mlAuthorizationUrl(codeChallenge: string): string {
  const url = new URL(ML_AUTH)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', requiredEnv('MERCADOLIVRE_CLIENT_ID'))
  url.searchParams.set('redirect_uri', requiredEnv('MERCADOLIVRE_REDIRECT_URI'))
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** Renovacao silenciosa do access token (grant refresh_token). ML recusa com 400/401
 * quando o refresh token esta invalido/revogado. */
export async function mlRefreshToken(refreshToken: string): Promise<MlTokenResponse> {
  return mlTokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: requiredEnv('MERCADOLIVRE_CLIENT_ID'),
      client_secret: requiredEnv('MERCADOLIVRE_CLIENT_SECRET'),
      refresh_token: refreshToken,
    }),
  )
}

async function mlTokenRequest(body: URLSearchParams): Promise<MlTokenResponse> {
  const response = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })

  const payload = (await response.json().catch(() => null)) as MlTokenResponse | null
  if (!response.ok || !payload?.access_token) {
    throw new MarketplaceError(
      `Falha ao obter token no Mercado Livre: ${JSON.stringify(payload)}`,
      response.status || 502,
    )
  }
  return payload
}

export async function mlExchangeCode(code: string, codeVerifier: string): Promise<MlTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: requiredEnv('MERCADOLIVRE_CLIENT_ID'),
    client_secret: requiredEnv('MERCADOLIVRE_CLIENT_SECRET'),
    code,
    redirect_uri: requiredEnv('MERCADOLIVRE_REDIRECT_URI'),
    code_verifier: codeVerifier,
  })
  return mlTokenRequest(body)
}

/**
 * Sem `q`: categorias raiz do site (`/sites/MLB/categories`).
 * Com `q`: busca por dominio (`/sites/MLB/domain_discovery/search`).
 *
 * O Mercado Livre passou a exigir token nesses endpoints: se houver credencial
 * salva ela e enviada como Bearer; sem ela a chamada tende a voltar 401/403.
 */
export async function mlSearchCategories(q?: string, accessToken?: string): Promise<CategoryOption[]> {
  const url = q
    ? `${ML_API}/sites/${ML_SITE_ID}/domain_discovery/search?limit=8&q=${encodeURIComponent(q)}`
    : `${ML_API}/sites/${ML_SITE_ID}/categories`

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MarketplaceError(
        'Mercado Livre recusou a consulta de categorias: conecte sua conta via /api/auth/mercadolivre primeiro',
        response.status,
      )
    }
    const body = await response.json().catch(() => null)
    const detail = (body as Record<string, unknown> | null)?.message
    throw new MarketplaceError(
      `API de categorias do Mercado Livre respondeu ${response.status}${detail ? `: ${detail}` : ''}`,
      response.status,
    )
  }

  const data = (await response.json()) as unknown
  if (!Array.isArray(data)) return []

  return data.map((raw) => {
    const item = raw as Record<string, unknown>
    const id = String(item.category_id ?? item.id ?? '')
    const name = String(item.category_name ?? item.name ?? id)
    const domain = item.domain_name ? `${String(item.domain_name)} > ` : ''
    return { id, path: `${domain}${name}` }
  })
}

export type MlListingItem = {
  id: string
  title: string
  price: number
  availableQuantity: number
  soldQuantity: number
  marketplace: 'mercadolivre'
  status: string
  thumbnail: string | null
  permalink: string | null
  familyId: string | null
  familyName: string | null
  listingTypeId: string | null
  logisticType: string | null
  freeShipping: boolean
}

async function mlFetch(path: string, accessToken?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const response = await fetch(`${ML_API}${path}`, { headers })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      (data as Record<string, unknown> | null)?.message ?? `Mercado Livre respondeu ${response.status}`
    throw new MarketplaceError(String(message), response.status || 502)
  }
  return data
}

export type MlRequiredAttribute = { id: string; name: string }

/**
 * Atributos que o ML marca como `catalog_required` pra essa categoria (ex: BRAND, COLLECTION
 * em categorias no programa de Catalogo). Quando existem, o ML exige `family_name` no lugar
 * de `title` e rejeita o item sem esses atributos — e o schema do Product nao tem como
 * preenche-los automaticamente, entao quem publica precisa saber disso antes de tentar.
 */
export async function mlRequiredCatalogAttributes(categoryId: string): Promise<MlRequiredAttribute[]> {
  const all = await mlCategoryAttributes(categoryId)
  // `catalog_required` = atributo de catalogo do ML; `required` = obrigatorio pro anuncio
  // (ex: MODEL, DIAMETER). Ambos precisam estar preenchidos antes de publicar.
  return all
    .filter((attr) => attr.catalogRequired || attr.required)
    .map(({ id, name }) => ({ id, name }))
}

/** Todos os atributos da categoria (id, nome, tags relevantes). Uma unica chamada serve
 * pra validar obrigatorios, casar campos customizados do produto com atributos ML pelo
 * nome (ex: campo "Materiais" -> atributo MATERIAL) e montar attribute_combinations
 * (atributos com tag allow_variations definem a variacao real do anuncio). */
export async function mlCategoryAttributes(
  categoryId: string,
): Promise<Array<{ id: string; name: string; catalogRequired: boolean; required: boolean; allowVariations: boolean }>> {
  const data = (await mlFetch(`/categories/${categoryId}/attributes`)) as Array<{
    id: string
    name: string
    tags?: { catalog_required?: boolean; required?: boolean; allow_variations?: boolean }
  }>
  return data.map((attr) => ({
    id: attr.id,
    name: attr.name,
    catalogRequired: Boolean(attr.tags?.catalog_required),
    required: Boolean(attr.tags?.required),
    allowVariations: Boolean(attr.tags?.allow_variations),
  }))
}

/** Tags da conta do vendedor (GET /users/me). A tag `user_product_seller` indica que o
 * vendedor ja usa o novo modelo User Products: publicar com `title + variations[]` (modelo
 * antigo) e rejeitado — variacoes terao que virar 1 item por variacao (Fase B). */
export async function mlUserTags(accessToken: string): Promise<string[]> {
  const data = (await mlFetch('/users/me', accessToken)) as Record<string, unknown>
  return Array.isArray(data.tags) ? data.tags.map(String) : []
}

/** Subcategorias de uma categoria (children_categories) — navegacao hierarquica. */
export type MlCategoryNode = { id: string; name: string; hasChildren: boolean }

export async function mlCategoryChildren(categoryId: string, accessToken?: string): Promise<MlCategoryNode[]> {
  const data = (await mlFetch(`/categories/${categoryId}`, accessToken)) as {
    children_categories?: Array<{ id: string | number; name: string }>
  }
  return (data.children_categories ?? []).map((child) => ({
    id: String(child.id),
    name: child.name,
    hasChildren: true, // ML não marca folha aqui — detectamos com 2ª chamada se precisar
  }))
}

export async function mlMyUserId(accessToken: string): Promise<string> {
  const data = (await mlFetch('/users/me', accessToken)) as Record<string, unknown>
  const id = data.id
  if (id === undefined || id === null) throw new MarketplaceError('Mercado Livre nao retornou o id do usuario', 502)
  return String(id)
}

/** Cotação de envio ME2 por cobertura — resposta real de /users/{userId}/shipping_options/free.
 * Docs mostram exemplo com "options", mas a API atual devolve { coverage: { <área>: {...} } }:
 * list_cost = custo cheio; discount = subsídio do ML (rate/promoted_amount). */
export type MlShippingQuote = {
  coverage: string // ex: "all_country", "zone_1", id de país
  listCost: number
  currencyId: string
  billableWeight: number | null
  discountRate: number | null
  discountType: string | null
  promotedAmount: number | null
  freeShippingByMeli: boolean | null
}

/** Cotações de envio do vendedor (pré-venda). Docs: prefira `item_id`; sem ele envie
 * dimensions+item_price+listing_type_id+mode+condition+logistic_type+free_shipping —
 * só `dimensions` pode retornar list_cost=0 (falta contexto pra calcular). */
export async function mlShippingQuotes(
  accessToken: string,
  userId: string,
  query: Record<string, string>,
): Promise<MlShippingQuote[]> {
  const params = new URLSearchParams(query).toString()
  const data = (await mlFetch(`/users/${userId}/shipping_options/free?${params}`, accessToken)) as {
    coverage?: Record<string, Record<string, unknown>>
  }
  return Object.entries(data.coverage ?? {}).map(([coverage, raw]) => {
    const discount =
      raw.discount && typeof raw.discount === 'object'
        ? (raw.discount as Record<string, unknown>)
        : null
    return {
      coverage,
      listCost: Number(raw.list_cost ?? 0),
      currencyId: String(raw.currency_id ?? 'BRL'),
      billableWeight: raw.billable_weight != null ? Number(raw.billable_weight) : null,
      discountRate: discount && discount.rate != null ? Number(discount.rate) : null,
      discountType: discount && typeof discount.type === 'string' ? discount.type : null,
      promotedAmount: discount && discount.promoted_amount != null ? Number(discount.promoted_amount) : null,
      freeShippingByMeli: typeof raw.free_shipping_by_meli === 'boolean' ? raw.free_shipping_by_meli : null,
    }
  })
}

/** ids de todos os itens ativos do vendedor, paginando de 50 em 50 (limite da API). */
async function mlMyItemIds(accessToken: string, userId: string): Promise<string[]> {
  const ids: string[] = []
  const limit = 50
  let offset = 0
  for (;;) {
    const data = (await mlFetch(
      `/users/${userId}/items/search?limit=${limit}&offset=${offset}`,
      accessToken,
    )) as { results?: string[]; paging?: { total?: number } }
    const results = data.results ?? []
    ids.push(...results)
    offset += results.length
    const total = data.paging?.total ?? ids.length
    if (results.length === 0 || offset >= total) break
  }
  return ids
}

function toListingItem(raw: Record<string, unknown>): MlListingItem {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    price: Number(raw.price ?? 0),
    availableQuantity: Number(raw.available_quantity ?? 0),
    soldQuantity: Number(raw.sold_quantity ?? 0),
    marketplace: 'mercadolivre' as const,
    status: String(raw.status ?? 'unknown'),
    thumbnail: (raw.thumbnail as string | undefined) ?? null,
    permalink: (raw.permalink as string | undefined) ?? null,
    // Itens "variacao" de cor/tamanho no ML viram items separados que compartilham family_id —
    // nao e o array item.variations (esse continua vazio nesses casos).
    familyId: raw.family_id !== undefined && raw.family_id !== null ? String(raw.family_id) : null,
    familyName: (raw.family_name as string | undefined) ?? null,
    listingTypeId: (raw.listing_type_id as string | undefined) ?? null,
    logisticType: ((raw.shipping as Record<string, unknown> | undefined)?.logistic_type as string | undefined) ?? null,
    freeShipping: Boolean((raw.shipping as Record<string, unknown> | undefined)?.free_shipping),
  }
}

export type MlFee = {
  listingTypeId: string
  listingTypeName: string
  saleFeeAmount: number
}

/** Comissao real do ML pra um preco+categoria+tipo de anuncio — numero exato, nao estimativa. */
export async function mlListingFee(
  accessToken: string,
  price: number,
  categoryId: string,
  listingTypeId: string,
): Promise<MlFee> {
  const url = `/sites/${ML_SITE_ID}/listing_prices?price=${price}&category_id=${categoryId}&listing_type_id=${listingTypeId}`
  const data = (await mlFetch(url, accessToken)) as Record<string, unknown>
  return {
    listingTypeId: String(data.listing_type_id ?? listingTypeId),
    listingTypeName: String(data.listing_type_name ?? listingTypeId),
    saleFeeAmount: Number(data.sale_fee_amount ?? 0),
  }
}

/** Detalhe de ate 20 itens por chamada (limite do endpoint multiget `/items`). */
async function mlItemsByIds(ids: string[], accessToken: string): Promise<MlListingItem[]> {
  const batchSize = 20
  const items: MlListingItem[] = []
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const data = (await mlFetch(`/items?ids=${batch.join(',')}`, accessToken)) as Array<{
      code: number
      body: Record<string, unknown>
    }>
    for (const entry of data) {
      if (entry.code === 200) items.push(toListingItem(entry.body))
    }
  }
  return items
}

/** Anuncios ativos do vendedor dono do token, pra painel somente-leitura/edicao direta no ML. */
export async function mlMyListings(accessToken: string): Promise<MlListingItem[]> {
  const userId = await mlMyUserId(accessToken)
  const ids = await mlMyItemIds(accessToken, userId)
  if (ids.length === 0) return []
  return mlItemsByIds(ids, accessToken)
}

/** Detalhe cru do item — usado na sincronizacao (precisa de campos que MlListingItem nao guarda). */
export async function mlGetItemRaw(accessToken: string, itemId: string): Promise<Record<string, unknown>> {
  return (await mlFetch(`/items/${itemId}`, accessToken)) as Record<string, unknown>
}

/** Descricao do item — endpoint separado no ML, pode nao existir (item sem descricao). */
export async function mlGetItemDescription(accessToken: string, itemId: string): Promise<string> {
  try {
    const data = (await mlFetch(`/items/${itemId}/description`, accessToken)) as Record<string, unknown>
    return String(data.plain_text ?? '')
  } catch {
    return ''
  }
}

/** Caminho legivel da categoria (ex: "Casa > Decoracao"), pra guardar no ProductCategoryMap. */
export async function mlCategoryPath(categoryId: string): Promise<string> {
  try {
    const data = (await mlFetch(`/categories/${categoryId}`)) as {
      path_from_root?: Array<{ name: string }>
      name?: string
    }
    const names = data.path_from_root?.map((c) => c.name) ?? []
    return names.length > 0 ? names.join(' > ') : String(data.name ?? categoryId)
  } catch {
    return categoryId
  }
}

export async function mlUpdateItem(
  accessToken: string,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<MlListingItem> {
  // Conta UP (user_product_seller): items com family_name rejeitam PUT com title
  // (cause 374). Remove title do payload — os outros campos salvam normal.
  let finalPayload = payload
  if (payload.title) {
    const raw = await (await fetch(`${ML_API}/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })).json() as Record<string, unknown>
    if (raw.family_name) {
      finalPayload = { ...payload }
      delete finalPayload.title
    }
  }

  const response = await fetch(`${ML_API}/items/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(finalPayload),
  })

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !data?.id) {
    // ML manda cause[] com os campos rejeitados (ex: BODY_INVALID_FIELDS) — inclui no erro.
    const message = (data?.message as string | undefined) ?? `Mercado Livre respondeu ${response.status}`
    const causes = Array.isArray(data?.cause)
      ? (data.cause as Array<Record<string, unknown>>)
          .map((c) => `${c.code ?? c.type}: ${c.message ?? ''}`.trim())
          .join(' | ')
      : typeof data?.cause === 'number' ? ` (cause ${data.cause})` : ''
    throw new MarketplaceError(causes ? `${message} — ${causes}` : message, response.status || 502)
  }
  return toListingItem(data)
}

/** Descricao fica em endpoint separado — PUT /items/:id nao aceita esse campo. */
/** Adiciona foto nova a um anuncio existente: ML baixa a imagem da URL publica
 * (Supabase Storage — sem tunel). Retorna o array de pictures atualizado do item. */
export async function mlAddItemPicture(
  accessToken: string,
  itemId: string,
  sourceUrl: string,
): Promise<void> {
  const response = await fetch(`${ML_API}/pictures/${itemId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ source: sourceUrl }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = (body as Record<string, unknown> | null)?.message ?? `Mercado Livre respondeu ${response.status}`
    throw new MarketplaceError(String(message), response.status || 502)
  }
}

export async function mlUpdateItemDescription(accessToken: string, itemId: string, text: string): Promise<void> {  const response = await fetch(`${ML_API}/items/${itemId}/description`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ plain_text: text }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const message = (data as Record<string, unknown> | null)?.message ?? `Mercado Livre respondeu ${response.status}`
    throw new MarketplaceError(String(message), response.status || 502)
  }
}

export type MlPicture = { id: string; url: string }

export type MlListingDetail = MlListingItem & {
  description: string
  heightCm: number
  widthCm: number
  lengthCm: number
  weightGrams: number
  pictures: MlPicture[]
}

/** "HxLxC,gramas" — mesmo formato usado no publish/sync. */
function parseShippingDimensions(raw: unknown): { heightCm: number; widthCm: number; lengthCm: number; weightGrams: number } | null {
  if (typeof raw !== 'string') return null
  const match = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const [, h, w, l, g] = match
  return { heightCm: Math.round(Number(h)), widthCm: Math.round(Number(w)), lengthCm: Math.round(Number(l)), weightGrams: Math.round(Number(g)) }
}

/**
 * `shipping.dimensions` quase sempre volta `null` na leitura (o ML absorve o valor nos
 * atributos `SELLER_PACKAGE_*` em vez de ecoar a string de volta). Fallback pra esses
 * atributos antes de desistir e mostrar 0.
 */
function dimensionsFromAttributes(attributes: unknown): { heightCm: number; widthCm: number; lengthCm: number; weightGrams: number } {
  const zero = { heightCm: 0, widthCm: 0, lengthCm: 0, weightGrams: 0 }
  if (!Array.isArray(attributes)) return zero
  const list = attributes as Array<Record<string, unknown>>

  // SOMENTE SELLER_PACKAGE_*: sao as dimensoes da EMBALAGEM de envio.
  // HEIGHT/WIDTH/LENGTH/WEIGHT sem o prefixo sao especificacoes do produto
  // (ex: "a escultura tem 15cm de altura") — NAO sao dimensoes de envio.
  // Usar essas aqui injetava valores errados no modal.
  const numberFor = (id: string): number => {
    const attr = list.find((a) => a.id === id)
    if (!attr) return 0
    const struct = (attr?.values as Array<Record<string, unknown>> | undefined)?.[0]?.struct as
      | Record<string, unknown>
      | undefined
    const fromStruct = Number(struct?.number)
    return Number.isFinite(fromStruct) && fromStruct > 0 ? fromStruct : 0
  }
  return {
    heightCm: numberFor('SELLER_PACKAGE_HEIGHT'),
    widthCm: numberFor('SELLER_PACKAGE_WIDTH'),
    lengthCm: numberFor('SELLER_PACKAGE_LENGTH'),
    weightGrams: numberFor('SELLER_PACKAGE_WEIGHT'),
  }
}

/** Detalhe completo pro modal de edicao — campos que a listagem (mlMyListings) nao traz.
 * Dimensoes: do PRODUTO (HEIGHT/WIDTH/LENGTH/WEIGHT attributes), nao da embalagem
 * (SELLER_PACKAGE_*). O usuario edita as medidas fisicas do produto. */
export async function mlGetListingDetail(accessToken: string, itemId: string): Promise<MlListingDetail> {
  const raw = await mlGetItemRaw(accessToken, itemId)
  const description = await mlGetItemDescription(accessToken, itemId)
  const dims = dimsFromProductSpecs(raw.attributes) ?? dimensionsFromAttributes(raw.attributes)
  const pictures = Array.isArray(raw.pictures)
    ? (raw.pictures as Array<Record<string, unknown>>)
        .map((p) => ({ id: String(p.id ?? ''), url: String(p.secure_url ?? p.url ?? '') }))
        .filter((p) => p.id && p.url)
    : []

  return { ...toListingItem(raw), description, ...dims, pictures }
}

/** Dimensoes do PRODUTO: atributos HEIGHT/WIDTH/LENGTH/WEIGHT (especificacoes fisicas).
 * Diferente de SELLER_PACKAGE_* (embalagem de envio). */
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
  // Se nenhum atributo de produto tem valor, retorna null (usa embalagem como fallback)
  return result.heightCm > 0 || result.widthCm > 0 || result.lengthCm > 0 ? result : null
}

/**
 * Exclusao de anuncio no ML e irreversivel e exige 2 passos (doc oficial): primeiro fechar
 * (status: closed), depois marcar deleted: true — so funciona com o item ja fechado.
 * O 1o passo e tolerante a erro (item pode ja estar closed).
 */
export async function mlDeleteItem(accessToken: string, itemId: string): Promise<MlListingItem> {
  await mlUpdateItem(accessToken, itemId, { status: 'closed' }).catch(() => null)
  return mlUpdateItem(accessToken, itemId, { deleted: true })
}

export async function mlCreateItem(
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await fetch(`${ML_API}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !data?.id) {
    const message =
      (data?.message as string | undefined) ?? `Mercado Livre respondeu ${response.status}`
    throw new MarketplaceError(message, response.status || 502)
  }
  return { id: String(data.id) }
}

/** Desde 2021 o POST /items nao aceita descricao — cria o item sem ela e envia por aqui.
 * Documentacao: "Para criar a descricao, voce deve primeiro criar a publicacao sem uma
 * descricao e, em seguida, envia-la via POST para /items/$ITEM_ID/description". */
export async function mlCreateItemDescription(
  accessToken: string,
  itemId: string,
  plainText: string,
): Promise<void> {
  const response = await fetch(`${ML_API}/items/${itemId}/description`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ plain_text: plainText }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const message =
      (data?.message as string | undefined) ?? `Mercado Livre respondeu ${response.status}`
    throw new MarketplaceError(message, response.status || 502)
  }
}
