import { describe, expect, it } from 'vitest'
import { shipmentLabelsUrl } from '@/lib/marketplace/labels'

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
