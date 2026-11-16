import { describe, expect, it } from 'vitest'
import { aggregateMonthOrders, collectAllOrders } from '@/lib/marketplace/salesStats'

/** Pedido ML no shape de /orders/search results. */
function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123,
    status: 'paid',
    total_amount: 100,
    date_created: '2026-11-05T12:00:00.000-00:00',
    payments: [{ status: 'approved' }],
    order_items: [
      { quantity: 1, unit_price: 100, full_unit_price: 100, sale_fee: 13.5, item: { title: 'Vaso 3D' } },
    ],
    ...overrides,
  }
}

describe('aggregateMonthOrders', () => {
  it('soma quantidade, bruto e taxas de pedidos pagos', () => {
    const agg = aggregateMonthOrders([order({ id: 1 }), order({ id: 2, total_amount: 50 })])
    expect(agg.quantidade).toBe(2)
    expect(agg.valorBruto).toBeCloseTo(150)
    expect(agg.taxas).toBeCloseTo(27)
    expect(agg.ticketMedio).toBeCloseTo(75)
  })

  it('ignora pedido cancelado', () => {
    const agg = aggregateMonthOrders([order({ status: 'cancelled' })])
    expect(agg.quantidade).toBe(0)
    expect(agg.valorBruto).toBe(0)
  })

  it('ignora pedido sem pagamento aprovado (pending/refused)', () => {
    const agg = aggregateMonthOrders([
      order({ payments: [{ status: 'pending' }] }),
      order({ payments: [{ status: 'refused' }] }),
      order({ payments: [] }),
    ])
    expect(agg.quantidade).toBe(0)
  })

  it('conta pedido multi-item (cart) como 1 venda e usa total_amount inteiro', () => {
    const cart = order({
      total_amount: 250,
      order_items: [
        { quantity: 1, sale_fee: 10, item: {} },
        { quantity: 2, sale_fee: 20, item: {} },
      ],
    })
    const agg = aggregateMonthOrders([cart])
    expect(agg.quantidade).toBe(1)
    expect(agg.valorBruto).toBeCloseTo(250)
    expect(agg.taxas).toBeCloseTo(30)
  })

  it('tolera payments ausentes e sale_fee nulo sem quebrar', () => {
    const agg = aggregateMonthOrders([
      { id: 9, status: 'paid', total_amount: 40, order_items: [{ quantity: 1, sale_fee: null, item: {} }] },
    ])
    expect(agg.quantidade).toBe(1)
    expect(agg.taxas).toBe(0)
    expect(agg.ticketMedio).toBeCloseTo(40)
  })

  it('lista vazia devolve zeros (mes sem vendas)', () => {
    const agg = aggregateMonthOrders([])
    expect(agg).toEqual({ quantidade: 0, valorBruto: 0, taxas: 0, ticketMedio: 0 })
  })
})

describe('collectAllOrders', () => {
  it('pagina ate results < limit e agrega tudo', async () => {
    const page1 = { paging: { total: 60 }, results: Array.from({ length: 50 }, (_, i) => ({ id: i })) }
    const page2 = { paging: { total: 60 }, results: Array.from({ length: 10 }, (_, i) => ({ id: i })) }
    const calls: number[] = []
    const orders = await collectAllOrders(async (offset) => {
      calls.push(offset)
      return offset === 0 ? page1 : page2
    })
    expect(calls).toEqual([0, 50])
    expect(orders).toHaveLength(60)
  })

  it('para quando paging.total alcancado mesmo com pagina cheia', async () => {
    const page = (offset: number) => ({
      paging: { total: 50 },
      results: Array.from({ length: 50 }, (_, i) => ({ id: i + offset })),
    })
    const calls: number[] = []
    const orders = await collectAllOrders(async (offset) => {
      calls.push(offset)
      return page(offset)
    })
    expect(calls).toEqual([0])
    expect(orders).toHaveLength(50)
  })
})
