import crypto from 'node:crypto'
import { MarketplaceError, type CategoryOption } from './types'

/** Host de producao da Open Platform da Shopee. */
export const SHOPEE_HOST = 'https://partner.shopeemobile.com'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new MarketplaceError(`${name} nao configurado no .env`, 500)
  return value
}

/**
 * Assinatura HMAC-SHA256 exigida pela Shopee API v2.
 * base string = partner_id + api_path + timestamp [+ access_token + shop_id]
 */
function sign(apiPath: string, timestamp: number, accessToken?: string, shopId?: string): string {
  const partnerId = requiredEnv('SHOPEE_PARTNER_ID')
  const partnerKey = requiredEnv('SHOPEE_PARTNER_KEY')
  const base = `${partnerId}${apiPath}${timestamp}${accessToken ?? ''}${shopId ?? ''}`
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex')
}

function publicParams(apiPath: string): URLSearchParams {
  const timestamp = Math.floor(Date.now() / 1000)
  return new URLSearchParams({
    partner_id: requiredEnv('SHOPEE_PARTNER_ID'),
    timestamp: String(timestamp),
    sign: sign(apiPath, timestamp),
  })
}

function shopParams(apiPath: string, accessToken: string, shopId: string): URLSearchParams {
  const timestamp = Math.floor(Date.now() / 1000)
  return new URLSearchParams({
    partner_id: requiredEnv('SHOPEE_PARTNER_ID'),
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: shopId,
    sign: sign(apiPath, timestamp, accessToken, shopId),
  })
}

export function shopeeAuthorizationUrl(): string {
  const apiPath = '/api/v2/shop/auth_partner'
  const params = publicParams(apiPath)
  params.set('redirect', requiredEnv('SHOPEE_REDIRECT_URI'))
  return `${SHOPEE_HOST}${apiPath}?${params.toString()}`
}

export type ShopeeTokenResponse = {
  access_token: string
  refresh_token?: string
  expire_in?: number
}

export async function shopeeExchangeCode(code: string, shopId: string): Promise<ShopeeTokenResponse> {
  const apiPath = '/api/v2/auth/token/get_access_token'
  const response = await fetch(`${SHOPEE_HOST}${apiPath}?${publicParams(apiPath).toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      shop_id: Number(shopId),
      partner_id: Number(requiredEnv('SHOPEE_PARTNER_ID')),
    }),
  })

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !data?.access_token) {
    throw new MarketplaceError(
      `Falha ao trocar code por token na Shopee: ${JSON.stringify(data)}`,
      response.status || 502,
    )
  }
  return data as unknown as ShopeeTokenResponse
}

async function shopeeCall(
  apiPath: string,
  accessToken: string,
  shopId: string,
  init?: { method?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const url = `${SHOPEE_HOST}${apiPath}?${shopParams(apiPath, accessToken, shopId).toString()}`
  const response = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !data) {
    throw new MarketplaceError(`Shopee respondeu ${response.status}`, response.status || 502)
  }
  if (data.error) {
    throw new MarketplaceError(`Shopee: ${String(data.error)} - ${String(data.message ?? '')}`, 502)
  }
  return data
}

export async function shopeeGetCategories(
  accessToken: string,
  shopId: string,
  q?: string,
): Promise<CategoryOption[]> {
  const data = await shopeeCall('/api/v2/product/get_category', accessToken, shopId)
  const response = (data.response ?? {}) as Record<string, unknown>
  const list = Array.isArray(response.category_list) ? response.category_list : []

  const options = list.map((raw) => {
    const item = raw as Record<string, unknown>
    return {
      id: String(item.category_id ?? ''),
      path: String(item.display_category_name ?? item.original_category_name ?? item.category_id ?? ''),
    }
  })

  if (!q) return options
  const needle = q.toLowerCase()
  return options.filter((option) => option.path.toLowerCase().includes(needle))
}

export async function shopeeAddItem(
  accessToken: string,
  shopId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const data = await shopeeCall('/api/v2/product/add_item', accessToken, shopId, {
    method: 'POST',
    body: payload,
  })
  const response = (data.response ?? {}) as Record<string, unknown>
  const itemId = response.item_id
  if (!itemId) throw new MarketplaceError('Shopee nao retornou item_id', 502)
  return { id: String(itemId) }
}
