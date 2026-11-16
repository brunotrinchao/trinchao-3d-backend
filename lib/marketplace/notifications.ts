/** Central de notificações derivada dos pedidos ML recentes (live API, sem
 * webhook/schema). Eventos: venda nova, enviado, entregue, atraso, cancelado. */

import { mlMyUserId, mlMyOrders } from './mercadolivre'
import { mapOrder, type MlOrder } from './orders'

export type NotificationType = 'venda' | 'enviado' | 'entregue' | 'atraso' | 'cancelado'

export type MlNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  date: string
  orderId: string
}

/** Forma mínima de pedido p/ lógica pura (facilita testes). */
export type MlOrderLike = Pick<
  MlOrder,
  'id' | 'dateCreated' | 'status' | 'statusPagamento' | 'envio'
>

const DAY_MS = 86_400_000
const MAX_AGE_DAYS = 30
const DELAYED_AFTER_DAYS = 7

/** Classifica um pedido em notificação (ou null se nada relevante). */
function toNotification(o: MlOrderLike, now: Date): MlNotification | null {
  const created = new Date(o.dateCreated).getTime()
  if (Number.isNaN(created)) return null
  const ageDays = (now.getTime() - created) / DAY_MS
  if (ageDays > MAX_AGE_DAYS || ageDays < 0) return null

  const shortDate = new Date(o.dateCreated).toLocaleDateString('pt-BR')
  const shippingStatus = o.envio?.status ?? ''

  if (o.status === 'cancelled') {
    return {
      id: `order-${o.id}`,
      type: 'cancelado',
      title: 'Venda cancelada',
      body: `Pedido de ${shortDate} foi cancelado`,
      date: o.dateCreated,
      orderId: o.id,
    }
  }
  if (shippingStatus === 'delivered' || o.status === 'delivered') {
    return {
      id: `order-${o.id}`,
      type: 'entregue',
      title: 'Produto entregue',
      body: `Pedido de ${shortDate} foi entregue ao comprador`,
      date: o.dateCreated,
      orderId: o.id,
    }
  }
  if (shippingStatus === 'shipped' || o.status === 'shipped') {
    if (ageDays >= DELAYED_AFTER_DAYS) {
      return {
        id: `order-${o.id}`,
        type: 'atraso',
        title: 'Envio em andamento há tempo',
        body: `Pedido de ${shortDate} segue em trânsito após ${Math.floor(ageDays)} dias`,
        date: o.dateCreated,
        orderId: o.id,
      }
    }
    return {
      id: `order-${o.id}`,
      type: 'enviado',
      title: 'Pedido enviado',
      body: `Pedido de ${shortDate} foi despachado`,
      date: o.dateCreated,
      orderId: o.id,
    }
  }
  if (o.statusPagamento === 'pago' || o.status === 'paid') {
    return {
      id: `order-${o.id}`,
      type: 'venda',
      title: 'Nova venda',
      body: `Pedido de ${shortDate} confirmado — prepara o envio`,
      date: o.dateCreated,
      orderId: o.id,
    }
  }
  return null
}

/** Pedidos → notificações, ordenadas por data desc. */
export function buildNotifications(orders: MlOrderLike[], now = new Date()): MlNotification[] {
  return orders
    .map((o) => toNotification(o, now))
    .filter((n): n is MlNotification => n !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Notificações ao vivo: últimos 30 dias da Orders API (1-2 chamadas, limit 50). */
export async function getMlNotifications(accessToken: string): Promise<MlNotification[]> {
  const sellerId = await mlMyUserId(accessToken)
  const from = new Date(Date.now() - MAX_AGE_DAYS * DAY_MS).toISOString()
  const page = await mlMyOrders(accessToken, sellerId, from, 0)
  const orders = (Array.isArray(page.results) ? page.results : []).map(mapOrder)
  return buildNotifications(orders)
}
