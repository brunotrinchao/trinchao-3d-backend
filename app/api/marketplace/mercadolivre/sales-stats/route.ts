import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { getMlSalesStats } from '@/lib/marketplace/salesStats'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Stats de venda read-only: vendas do mes corrente (Orders API) + saldo Mercado Pago.
 * Fonte que falha vem como `null` — o frontend mostra "—", nunca numero fake. */
export async function GET(request: NextRequest) {
  try {
    const credential = await getFreshMlCredential()

    return json(await getMlSalesStats(credential.accessToken))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/sales-stats failed:', err)
    return error('Nao foi possivel consultar as vendas no Mercado Livre', 502)
  }
}
