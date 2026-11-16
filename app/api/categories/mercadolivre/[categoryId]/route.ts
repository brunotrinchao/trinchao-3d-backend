import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { mlCategoryChildren } from '@/lib/marketplace/mercadolivre'
import { getFreshMlCredentialOrNull } from '@/lib/marketplace/mlCredential'
import { MarketplaceError } from '@/lib/marketplace/types'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ categoryId: string }> }

/** GET /api/categories/mercadolivre/:categoryId — subcategorias (navegação hierárquica). */
export async function GET(_request: NextRequest, { params }: Context) {
  const { categoryId } = await params
  try {
    const credential = await getFreshMlCredentialOrNull()
    const children = await mlCategoryChildren(categoryId, credential?.accessToken)
    return json(children)
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`GET /api/categories/mercadolivre/${categoryId} failed:`, err)
    return error('Nao foi possivel consultar as subcategorias do Mercado Livre', 502)
  }
}
