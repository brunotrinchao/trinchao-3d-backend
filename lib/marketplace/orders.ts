/** Pedidos do vendedor (Orders API ML) — read-only, live API, zero schema.
 * Mappers puros tolerantes a campo ausente; shape da API do ML fica isolado aqui. */

import { mlMyUserId, mlOrderById, mlOrdersSearch, mlShipment } from './mercadolivre'

export type MlOrderItem = {
  titulo: string
  quantidade: number
  precoUnitario: number
  variacao?: string
  sku?: string
}

export type MlOrder = {
  id: string
  dateCreated: string
  status: string
  statusPagamento: 'pago' | 'pendente' | 'recusado'
  comprador: { nickname: string; nome: string }
  itens: MlOrderItem[]
  total: number
  taxa: number
  envio: { id: string; status: string; substatus?: string } | null
}

export type MlShipmentDetail = {
  status: string
  substatus?: string
  rastreamento: string | null
  metodo: string | null
  endereco:
    | {
        rua: string
        numero: string
        complemento?: string
        cep: string
        cidade: string
        estado: string
      }
    | null
}

/** Status de pagamento consolidado — prioridade: algum `approved` = pago,
 * senão pendente, senão recusado. Sem payments (vazio/ausente) = pendente. */
export function paymentStatusFrom(
  payments: Array<Record<string, unknown>> | undefined,
): MlOrder['statusPagamento'] {
  const list = payments ?? []
  if (list.some((p) => String(p.status ?? '') === 'approved')) return 'pago'
  if (list.length === 0) return 'pendente'
  if (list.some((p) => String(p.status ?? '') === 'pending')) return 'pendente'
  return 'recusado'
}

function firstVariationLabel(raw: unknown): string | undefined {
  const attrs = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
  const label = attrs
    .map((a) => String(a.value_name ?? ''))
    .filter(Boolean)
    .join(' / ')
  return label || undefined
}

/** Result de /orders/search → DTO. Campos ausentes viram defaults, nunca quebram. */
export function mapOrder(raw: unknown): MlOrder {
  const o = (raw ?? {}) as Record<string, unknown>
  const buyer = (o.buyer ?? {}) as Record<string, unknown>
  const nickname = String(buyer.nickname ?? '')
  const nome = [buyer.first_name, buyer.last_name]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const shipping = (o.shipping ?? null) as Record<string, unknown> | null
  const items = Array.isArray(o.order_items) ? (o.order_items as Array<Record<string, unknown>>) : []
  const payments = Array.isArray(o.payments)
    ? (o.payments as Array<Record<string, unknown>>)
    : undefined

  return {
    id: String(o.id ?? ''),
    dateCreated: String(o.date_created ?? ''),
    status: String(o.status ?? ''),
    statusPagamento: paymentStatusFrom(payments),
    comprador: { nickname, nome: nome || nickname },
    itens: items.map((item) => {
      const it = (item.item ?? {}) as Record<string, unknown>
      return {
        titulo: String(it.title ?? ''),
        quantidade: Number(item.quantity ?? 0),
        precoUnitario: Number(item.unit_price ?? 0),
        variacao: firstVariationLabel(it.variation_attributes),
        sku: it.seller_sku ? String(it.seller_sku) : undefined,
      }
    }),
    total: Number(o.total_amount ?? 0) || 0,
    taxa: items.reduce((sum, item) => sum + (Number(item.sale_fee ?? 0) || 0), 0),
    envio:
      shipping && (shipping.id !== undefined || shipping.id !== null)
        ? {
            id: String(shipping.id ?? ''),
            status: String(shipping.status ?? ''),
            substatus: shipping.substatus ? String(shipping.substatus) : undefined,
          }
        : null,
  }
}

/** Result de /shipments/:id → DTO. Endereço ausente = null (não é erro). */
export function mapShipment(raw: unknown): MlShipmentDetail {
  const s = (raw ?? {}) as Record<string, unknown>
  const addr = (s.receiver_address ?? null) as Record<string, unknown> | null
  const city = ((addr?.city ?? null) as Record<string, unknown> | null) ?? {}
  const state = ((addr?.state ?? null) as Record<string, unknown> | null) ?? {}

  return {
    status: String(s.status ?? ''),
    substatus: s.substatus ? String(s.substatus) : undefined,
    rastreamento: s.tracking_number ? String(s.tracking_number) : null,
    metodo: s.tracking_method ? String(s.tracking_method) : null,
    endereco:
      addr && (addr.street_name || addr.zip_code)
        ? {
            rua: String(addr.street_name ?? ''),
            numero: String(addr.street_number ?? ''),
            complemento: addr.comment ? String(addr.comment) : undefined,
            cep: String(addr.zip_code ?? ''),
            cidade: String(city.name ?? ''),
            estado: String(state.name ?? ''),
          }
        : null,
  }
}

export type MlOrdersFilters = {
  seller: string
  q?: string
  status?: string
  from?: string
  to?: string
  offset?: number
}

/** Query string de /orders/search — só params presentes vão (limit fixo 20/página). */
export function buildOrdersSearchParams(f: MlOrdersFilters): string {
  const p = new URLSearchParams()
  p.set('seller', f.seller)
  p.set('sort', 'date_desc')
  p.set('limit', '20')
  p.set('offset', String(f.offset ?? 0))
  if (f.q) p.set('q', f.q)
  if (f.status) p.set('order.status', f.status)
  if (f.from) p.set('order.date_created.from', f.from)
  if (f.to) p.set('order.date_created.to', f.to)
  return p.toString()
}

/** Lista paginada de pedidos com filtros (passa direto na Orders API). */
export async function getMlOrders(
  accessToken: string,
  filters: Omit<MlOrdersFilters, 'seller'>,
): Promise<{ orders: MlOrder[]; total: number }> {
  const seller = await mlMyUserId(accessToken)
  const page = await mlOrdersSearch(accessToken, buildOrdersSearchParams({ seller, ...filters }))
  return {
    orders: (Array.isArray(page.results) ? page.results : []).map(mapOrder),
    total: Number(page.paging?.total ?? 0),
  }
}

/** Detalhe de entrega de um pedido: order → shipping.id → /shipments/:id.
 * Pedido sem envio (entrega a combinar/digital) e shipment 404 voltam como
 * `envio: null` + `reason` — não são erros pro frontend. */
export async function getMlOrderShipment(
  accessToken: string,
  orderId: string,
): Promise<{ envio: MlShipmentDetail | null; reason?: string }> {
  const order = (await mlOrderById(accessToken, orderId)) as Record<string, unknown>
  const shipping = (order.shipping ?? null) as Record<string, unknown> | null
  if (!shipping || shipping.id === undefined || shipping.id === null) {
    return { envio: null, reason: 'pedido sem envio (entrega a combinar ou sem frete)' }
  }
  try {
    const detail = await mlShipment(accessToken, String(shipping.id))
    return { envio: mapShipment(detail) }
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) return { envio: null, reason: 'detalhes de envio indisponíveis' }
    throw err
  }
}
