import { describe, expect, it } from 'vitest'
import { parseRetryAfterMs, shipmentLabelsUrl } from '@/lib/marketplace/labels'

describe('shipmentLabelsUrl', () => {
  it('monta URL de etiqueta individual (PDF)', () => {
    expect(shipmentLabelsUrl('555001')).toBe(
      'https://api.mercadolibre.com/shipment_labels?shipment_ids=555001&response_type=pdf&savePdf=Y',
    )
  })

  it('aceita múltiplos shipments (PLP) e tipo zpl2', () => {
    expect(shipmentLabelsUrl(['1', '2'], 'zpl2')).toBe(
      'https://api.mercadolibre.com/shipment_labels?shipment_ids=1,2&response_type=zpl2&savePdf=Y',
    )
  })
})

describe('parseRetryAfterMs', () => {
  it('lê header Retry-After em segundos', () => {
    expect(parseRetryAfterMs('2')).toBe(2000)
  })

  it('sem header → default 1000ms', () => {
    expect(parseRetryAfterMs(null)).toBe(1000)
  })

  it('header inválido → default', () => {
    expect(parseRetryAfterMs('abc')).toBe(1000)
  })
})
