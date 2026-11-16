import type { NextRequest } from 'next/server'
import { error } from '@/lib/cors'
import { fetchShipmentLabel } from '@/lib/marketplace/labels'
import { mlOrderById } from '@/lib/marketplace/mercadolivre'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

/** Etiqueta de envio do pedido (PDF) — proxy autenticado de shipment_labels.
 * Pedido sem envio → 404. Falha do ML → status propagado. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params
  try {
    const credential = await getFreshMlCredential()

    const order = (await mlOrderById(credential.accessToken, itemId)) as Record<string, unknown>
    const shipping = (order.shipping ?? null) as Record<string, unknown> | null
    if (!shipping || shipping.id === undefined || shipping.id === null) {
      return error('Pedido sem envio — etiqueta indisponível', 404)
    }

    const upstream = await fetchShipmentLabel(credential.accessToken, String(shipping.id))
    if (upstream.status === 429) {
      return error(
        'Mercado Livre limitou as consultas de etiqueta agora — tente de novo em alguns segundos',
        429,
      )
    }
    if (!upstream.ok) {
      const body = (await upstream.json().catch(() => null)) as { message?: string } | null
      const mlMessage = String(body?.message ?? `Mercado Livre respondeu ${upstream.status}`)
      // Estados do shipment onde a etiqueta ainda não existe — mensagem orientável
      const stateHint: Record<string, string> = {
        invoice_pending:
          'Etiqueta indisponível: o envio está aguardando faturamento (invoice_pending). Emite a nota/fatura e tenta de novo.',
        pending: 'Etiqueta indisponível: envio ainda não foi processado pelo ML.',
        cancelled: 'Etiqueta indisponível: o envio foi cancelado.',
      }
      const shipmentState = mlMessage.match(/status is ([a-z_]+)/i)?.[1]
      const friendly =
        (shipmentState && stateHint[shipmentState]) ??
        `${mlMessage} — a etiqueta pode não estar disponível ainda para este envio`
      return error(friendly, upstream.status === 422 || upstream.status === 400 ? 409 : upstream.status)
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="etiqueta-${itemId}.pdf"`,
        'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
      },
    })
  } catch (err) {
    if (err instanceof MarketplaceError) {
      const friendly =
        err.status === 429
          ? 'Mercado Livre limitou as consultas agora — tente de novo em alguns segundos'
          : err.message
      return error(friendly, err.status)
    }
    console.error('GET orders/:id/label failed:', err)
    return error('Nao foi possivel obter a etiqueta no Mercado Livre', 502)
  }
}
