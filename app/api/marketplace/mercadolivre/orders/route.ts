import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { getMlOrders } from '@/lib/marketplace/orders'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Lista paginada de pedidos ML (read-only, live API). Filtros: q (busca),
 * status, from/to (ISO), offset. 20 pedidos por página. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const offsetRaw = sp.get('offset')
  const offset = offsetRaw !== null && Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0

  try {
    const credential = await getFreshMlCredential()

    return json(
      await getMlOrders(credential.accessToken, {
        q: sp.get('q') ?? undefined,
        status: sp.get('status') ?? undefined,
        from: sp.get('from') ?? undefined,
        to: sp.get('to') ?? undefined,
        offset,
      }),
    )
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/orders failed:', err)
    return error('Nao foi possivel consultar os pedidos no Mercado Livre', 502)
  }
}
