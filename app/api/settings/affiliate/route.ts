import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { error, json } from '@/lib/cors'
import { getSetting, setSetting } from '@/lib/settings'
import { validateAffiliateTag } from '@/lib/marketplace/affiliate'

export { OPTIONS } from '@/lib/cors'

const AFFILIATE_KEY = 'affiliateTag'

/** Tag de afiliado ML (formato 1 `SEUNOME-20` ou formato 2 `matt:usuario:toolid`). */
export async function GET() {
  try {
    return json({ affiliateTag: await getSetting(AFFILIATE_KEY) })
  } catch (err) {
    console.error('GET /api/settings/affiliate failed:', err)
    return error('Nao foi possivel carregar a configuracao', 500)
  }
}

const bodySchema = z.object({ tag: z.string().trim().max(200) })

/** Salva/limpa a tag. Não-vazio precisa ser formato válido (tag simples ou matt). */
export async function PUT(request: NextRequest) {
  try {
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return error('Body inválido: { tag: string }', 400)
    if (body.data.tag && validateAffiliateTag(body.data.tag).formato === null) {
      return error(
        'Tag invalida — use "SEUNOME-20" (tag simples) ou "matt:usuario:toolid"',
        400,
      )
    }
    await setSetting(AFFILIATE_KEY, body.data.tag)
    return json({ affiliateTag: body.data.tag })
  } catch (err) {
    console.error('PUT /api/settings/affiliate failed:', err)
    return error('Nao foi possivel salvar a configuracao', 500)
  }
}
