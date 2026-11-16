import { describe, expect, it } from 'vitest'
import { buildNotifications, type MlOrderLike } from '@/lib/marketplace/notifications'

const now = new Date('2026-11-16T18:00:00Z')
function order(o: Partial<MlOrderLike>): MlOrderLike {
  return { id: '1', dateCreated: '2026-11-16T10:00:00Z', status: 'paid', statusPagamento: 'pago', envio: null, ...o }
}

describe('buildNotifications', () => {
  it('venda nova (hoje) → notificação de venda', () => {
    const n = buildNotifications([order({})], now)
    expect(n[0]).toMatchObject({ type: 'venda', orderId: '1' })
  })

  it('pedido enviado → notificação de envio', () => {
    const n = buildNotifications([order({ status: 'shipped', envio: { id: '9', status: 'shipped' } })], now)
    expect(n[0].type).toBe('enviado')
  })

  it('pedido entregue → notificação de entrega', () => {
    const n = buildNotifications([order({ status: 'delivered', envio: { id: '9', status: 'delivered' } })], now)
    expect(n[0].type).toBe('entregue')
  })

  it('cancelado → notificação de cancelamento', () => {
    const n = buildNotifications([order({ status: 'cancelled', statusPagamento: 'recusado' })], now)
    expect(n[0].type).toBe('cancelado')
  })

  it('enviado há mais de 7 dias sem entrega → atraso', () => {
    const n = buildNotifications(
      [order({ status: 'shipped', dateCreated: '2026-11-05T10:00:00Z', envio: { id: '9', status: 'shipped' } })],
      now,
    )
    expect(n[0].type).toBe('atraso')
  })

  it('pedidos antigos (>30 dias) fora — sem notificação', () => {
    const n = buildNotifications([order({ dateCreated: '2026-09-01T10:00:00Z' })], now)
    expect(n).toHaveLength(0)
  })

  it('ordena por data desc (mais recente primeiro)', () => {
    const n = buildNotifications(
      [
        order({ id: 'a', dateCreated: '2026-11-15T10:00:00Z' }),
        order({ id: 'b', dateCreated: '2026-11-16T10:00:00Z' }),
      ],
      now,
    )
    expect(n[0].orderId).toBe('b')
  })
})
