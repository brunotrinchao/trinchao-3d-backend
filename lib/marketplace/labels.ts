/** Etiquetas de envio ML (shipment_labels) — proxy autenticado do PDF/ZPL. */

const ML_API = 'https://api.mercadolibre.com'

/** URL do endpoint de etiquetas. Individual ou PLP (múltiplos shipments). */
export function shipmentLabelsUrl(
  shipmentIds: string | string[],
  responseType: 'pdf' | 'zpl2' = 'pdf',
): string {
  const ids = Array.isArray(shipmentIds)
    ? shipmentIds.map((id) => encodeURIComponent(id)).join(',')
    : encodeURIComponent(shipmentIds)
  return `${ML_API}/shipment_labels?shipment_ids=${ids}&response_type=${responseType}&savePdf=Y`
}

/** Header Retry-After (segundos) → ms. Sem header/inválido → 1s default. */
export function parseRetryAfterMs(header: string | null): number {
  const s = Number(header)
  return Number.isFinite(s) && s > 0 ? s * 1000 : 1000
}

/** Busca o PDF da etiqueta (stream) com retry em 429 (rate limit do ML —
 * shipment_labels tem limite baixo). Até 2 tentativas extras. */
export async function fetchShipmentLabel(
  accessToken: string,
  shipmentIds: string | string[],
  responseType: 'pdf' | 'zpl2' = 'pdf',
): Promise<Response> {
  const url = shipmentLabelsUrl(shipmentIds, responseType)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/pdf' },
    })
    if (res.status !== 429 || attempt >= 2) return res
    const waitMs = parseRetryAfterMs(res.headers.get('retry-after'))
    await new Promise((r) => setTimeout(r, waitMs))
  }
}
