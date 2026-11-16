import { mlMyOrders, mlMpBalance, mlMyUserId } from './mercadolivre'

/** Stats de venda ML (read-only): pedidos do mes corrente via Orders API + saldo
 * Mercado Pago. Cada fonte falha isoladamente — o bloco vira `null`, nunca 0 falso. */

export type MlMonthSales = {
  quantidade: number
  valorBruto: number
  taxas: number
  ticketMedio: number
}

export type MlReceivedTotal = {
  disponivel: number
  aLiberar: number
  total: number
}

export type MlSalesStats = {
  vendasMes: MlMonthSales | null
  recebidoTotal: MlReceivedTotal | null
}

/** Primeiro dia do mes corrente (UTC) em ISO — filtro padrao da Orders API. */
export function currentMonthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Agrega pedidos ML em stats do mes. Pedido multi-item (cart) conta como 1 venda e
 * usa `total_amount` inteiro (soma item a item duplicaria). So pedido pago conta:
 * `status !== cancelled` + ao menos um payment `approved`. */
export function aggregateMonthOrders(orders: unknown[]): MlMonthSales {
  const pagos = orders.filter((raw) => {
    const o = raw as Record<string, unknown>
    const status = String(o.status ?? '')
    if (status === 'cancelled') return false
    // Array `payments` presente decide (mesmo vazio = nada aprovado). Ausente por
    // inteiro: confia no status do pedido.
    if (!Array.isArray(o.payments)) return status !== 'pending'
    return (o.payments as Array<Record<string, unknown>>).some((p) => String(p.status ?? '') === 'approved')
  })

  let valorBruto = 0
  let taxas = 0
  for (const raw of pagos) {
    const o = raw as Record<string, unknown>
    valorBruto += Number(o.total_amount ?? 0) || 0
    const items = Array.isArray(o.order_items) ? (o.order_items as Array<Record<string, unknown>>) : []
    for (const item of items) taxas += Number(item.sale_fee ?? 0) || 0
  }
  const quantidade = pagos.length
  return {
    quantidade,
    valorBruto,
    taxas,
    ticketMedio: quantidade > 0 ? valorBruto / quantidade : 0,
  }
}

export type MlOrderPage = {
  paging: { total?: number; limit?: number; offset?: number }
  results?: unknown[]
}

/** Coleta todas as paginas da Orders API (limit 50 por chamada). Para quando a pagina
 * vem incompleta ou o paging.total foi alcancado. */
export async function collectAllOrders(
  fetchPage: (offset: number) => Promise<MlOrderPage>,
): Promise<unknown[]> {
  const PAGE_LIMIT = 50
  const all: unknown[] = []
  let offset = 0
  for (;;) {
    const page = await fetchPage(offset)
    const results = Array.isArray(page.results) ? page.results : []
    all.push(...results)
    const total = Number(page.paging?.total ?? 0)
    offset += results.length
    if (results.length < PAGE_LIMIT || (total > 0 && offset >= total) || results.length === 0) break
  }
  return all
}

/** Stats completas: Orders API (mes corrente) + saldo Mercado Pago. Falha de uma fonte
 * nao derruba a outra — bloco vira null e o frontend mostra "—". */
export async function getMlSalesStats(accessToken: string): Promise<MlSalesStats> {
  const userId = await mlMyUserId(accessToken)

  const [vendasMes, recebidoTotal] = await Promise.all([
    (async (): Promise<MlMonthSales | null> => {
      try {
        const orders = await collectAllOrders((offset) =>
          mlMyOrders(accessToken, userId, currentMonthStartISO(), offset),
        )
        return aggregateMonthOrders(orders)
      } catch (err) {
        console.error('salesStats: Orders API falhou:', err)
        return null
      }
    })(),
    (async (): Promise<MlReceivedTotal | null> => {
      try {
        return await mlMpBalance(accessToken, userId)
      } catch (err) {
        console.error('salesStats: saldo Mercado Pago falhou:', err)
        return null
      }
    })(),
  ])

  return { vendasMes, recebidoTotal }
}
