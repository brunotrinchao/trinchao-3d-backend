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

/** Busca o PDF da etiqueta (stream) — falha de auth/404 do ML propagada. */
export async function fetchShipmentLabel(
  accessToken: string,
  shipmentIds: string | string[],
  responseType: 'pdf' | 'zpl2' = 'pdf',
): Promise<Response> {
  return fetch(shipmentLabelsUrl(shipmentIds, responseType), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/pdf' },
  })
}
