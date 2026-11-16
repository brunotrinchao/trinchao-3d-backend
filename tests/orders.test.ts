import { describe, expect, it } from 'vitest'
import {
  buildOrdersSearchParams,
  mapOrder,
  mapShipment,
  paymentStatusFrom,
} from '@/lib/marketplace/orders'

/** Order no shape de /orders/search results. */
function mlOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 98765,
    status: 'paid',
    date_created: '2026-11-10T14:30:00.000-04:00',
    total_amount: 189.9,
    payments: [{ status: 'approved' }],
    buyer: { nickname: 'COMPRADOR_BOM', first_name: 'Maria', last_name: 'Silva' },
    shipping: { id: 555001, status: 'ready_to_ship' },
    order_items: [
      {
        quantity: 2,
        unit_price: 94.95,
        sale_fee: 25.16,
        item: { title: 'Vaso geométrico 20cm' },
      },
    ],
    ...overrides,
  }
}

describe('mapOrder', () => {
  it('mapeia shape completo', () => {
    const o = mapOrder(mlOrder())
    expect(o.id).toBe('98765')
    expect(o.status).toBe('paid')
    expect(o.statusPagamento).toBe('pago')
    expect(o.comprador.nome).toBe('Maria Silva')
    expect(o.total).toBe(189.9)
    expect(o.taxa).toBeCloseTo(25.16)
    expect(o.envio).toEqual({ id: '555001', status: 'ready_to_ship', substatus: undefined })
    expect(o.itens).toHaveLength(1)
    expect(o.itens[0].titulo).toBe('Vaso geométrico 20cm')
  })

  it('nickname fallback quando sem nome', () => {
    const o = mapOrder(mlOrder({ buyer: { nickname: 'COMPRADOR_BOM' } }))
    expect(o.comprador.nome).toBe('COMPRADOR_BOM')
    expect(o.comprador.nickname).toBe('COMPRADOR_BOM')
  })

  it('item com variação e sku entram', () => {
    const o = mapOrder(
      mlOrder({
        order_items: [
          {
            quantity: 1,
            unit_price: 50,
            sale_fee: 6.5,
            item: {
              title: 'Porta celular',
              seller_sku: 'SKU-1',
              variation_attributes: [{ name: 'Cor', value_name: 'Azul' }],
            },
          },
        ],
      }),
    )
    expect(o.itens[0].variacao).toBe('Azul')
    expect(o.itens[0].sku).toBe('SKU-1')
  })

  it('sem shipping → envio null', () => {
    const o = mapOrder(mlOrder({ shipping: undefined }))
    expect(o.envio).toBeNull()
  })

  it('campos ausentes não quebram', () => {
    const o = mapOrder({ id: 1 })
    expect(o.comprador.nome).toBe('')
    expect(o.total).toBe(0)
    expect(o.itens).toEqual([])
    expect(o.envio).toBeNull()
  })
})

describe('paymentStatusFrom', () => {
  it('prioridade: approved > pending > refused', () => {
    expect(paymentStatusFrom([{ status: 'pending' }, { status: 'approved' }])).toBe('pago')
    expect(paymentStatusFrom([{ status: 'refused' }, { status: 'pending' }])).toBe('pendente')
    expect(paymentStatusFrom([{ status: 'refused' }])).toBe('recusado')
    expect(paymentStatusFrom([])).toBe('pendente')
  })
})

describe('buildOrdersSearchParams', () => {
  it('inclui só params presentes', () => {
    const q = buildOrdersSearchParams({ seller: '123', offset: 40 })
    expect(q).toBe('seller=123&sort=date_desc&limit=20&offset=40')
  })

  it('com todos os filtros', () => {
    const q = buildOrdersSearchParams({
      seller: '123',
      q: 'vaso 3d',
      status: 'paid',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-16T23:59:59Z',
      offset: 20,
    })
    expect(q).toContain('q=vaso') // URLSearchParams encoda espaço como '+'
    expect(q).toContain('order.status=paid')
    expect(q).toContain('order.date_created.from=2026-11-01T00%3A00%3A00Z')
    expect(q).toContain('order.date_created.to=')
    expect(q).toContain('offset=20')
  })
})

describe('mapShipment', () => {
  it('mapeia shape completo', () => {
    const s = mapShipment({
      status: 'shipped',
      substatus: null,
      tracking_number: 'RB123456789BR',
      tracking_method: 'correios',
      receiver_address: {
        street_name: 'Rua A',
        street_number: '123',
        comment: 'ap 4',
        zip_code: '80000-000',
        city: { name: 'Curitiba' },
        state: { name: 'Paraná' },
      },
    })
    expect(s.status).toBe('shipped')
    expect(s.rastreamento).toBe('RB123456789BR')
    expect(s.metodo).toBe('correios')
    expect(s.endereco?.cidade).toBe('Curitiba')
    expect(s.endereco?.complemento).toBe('ap 4')
  })

  it('endereço ausente → null, sem quebrar', () => {
    const s = mapShipment({ status: 'ready_to_ship' })
    expect(s.endereco).toBeNull()
    expect(s.rastreamento).toBeNull()
  })
})
