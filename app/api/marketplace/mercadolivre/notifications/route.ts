import { error, json } from '@/lib/cors'
import { getMlNotifications } from '@/lib/marketplace/notifications'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Central de notificações: eventos dos últimos 30 dias derivados da Orders API
 * (venda, enviado, entregue, atraso, cancelado). Live API, sem schema. */
export async function GET() {
  try {
    const credential = await getFreshMlCredential()

    return json(await getMlNotifications(credential.accessToken))
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error('GET /api/marketplace/mercadolivre/notifications failed:', err)
    return error('Nao foi possivel consultar as notificacoes no Mercado Livre', 502)
  }
}
