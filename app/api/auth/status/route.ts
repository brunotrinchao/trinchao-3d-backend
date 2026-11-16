import { json } from '@/lib/cors'
import { prisma } from '@/lib/prisma'
import { isCredentialExpired, getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { mlUserTags } from '@/lib/marketplace/mercadolivre'

export { OPTIONS } from '@/lib/cors'

const MARKETPLACES = ['mercadolivre', 'shopee'] as const

export async function GET() {
  const rows = await prisma.marketplaceCredential.findMany({
    select: { marketplace: true, expiresAt: true },
  })
  const byMarketplace = new Map(rows.map((row) => [row.marketplace, row]))

  const status = await Promise.all(
    MARKETPLACES.map(async (marketplace) => {
      const row = byMarketplace.get(marketplace) ?? null
      // Credencial com token expirado (ou expirando) aparece como "Reconectar conta" na
      // sidebar — connected so quando o token ainda vale.
      const expired = row !== null && isCredentialExpired(row.expiresAt)
      // Tag `user_product_seller`: conta ML ja usa o novo modelo User Products (variacoes
      // como itens separados) — publicar com `variations[]` antigo falharia. Best-effort.
      let upModel: boolean | null = null
      if (marketplace === 'mercadolivre' && row && !expired) {
        try {
          const credential = await getFreshMlCredential()
          upModel = (await mlUserTags(credential.accessToken)).includes('user_product_seller')
        } catch (err) {
          console.error('GET /api/auth/status upModel check failed:', err)
        }
      }
      return { marketplace, connected: row !== null && !expired, expired, upModel, expiresAt: row?.expiresAt ?? null }
    }),
  )

  return json(status)
}

