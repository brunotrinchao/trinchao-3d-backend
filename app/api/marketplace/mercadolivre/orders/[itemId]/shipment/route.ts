import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { getMlOrderShipment } from '@/lib/marketplace/orders'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Detalhe de entrega de um pedido (rastreio, método, endereço, status).
 * Pedido sem envio ou shipment indisponível volta `envio: null` + `reason`. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params
  try {
    const credential = await getFreshMlCredential()

    return json(await getMlOrderShipment(credential.accessToken, itemId))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/orders/:id/shipment failed:', err)
    return error('Nao foi possivel consultar o envio no Mercado Livre', 502)
  }
}
