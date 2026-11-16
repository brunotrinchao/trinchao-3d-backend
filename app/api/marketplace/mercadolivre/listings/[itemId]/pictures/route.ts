import type { NextRequest } from 'next/server'
import { error, json } from '@/lib/cors'
import { getFreshMlCredential } from '@/lib/marketplace/mlCredential'
import { mlAddItemPicture, mlGetListingDetail } from '@/lib/marketplace/mercadolivre'
import { MarketplaceError } from '@/lib/marketplace/types'
import { imageObjectPath, storagePublicUrl, storageUpload } from '@/lib/storage'
import { safeFilename } from '@/lib/uploads'

export { OPTIONS } from '@/lib/cors'

type Context = { params: Promise<{ itemId: string }> }

/** POST multipart — adiciona fotos novas ao anuncio direto no ML.
 * Arquivo vai pro Supabase Storage (URL publica) e o ML baixa dele. */
export async function POST(request: NextRequest, { params }: Context) {
  const { itemId } = await params
  try {
    const credential = await getFreshMlCredential()

    const form = await request.formData()
    const files = [...form.getAll('images'), ...form.getAll('image'), ...form.getAll('file')].filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    )
    if (files.length === 0) return error('Nenhum arquivo enviado no campo "images"', 422)

    for (const file of files) {
      const filename = `${Date.now()}-${safeFilename(file.name || 'image.jpg')}`
      const objectPath = imageObjectPath(`ml-direct/${itemId}`, filename)
      await storageUpload(objectPath, Buffer.from(await file.arrayBuffer()))
      await mlAddItemPicture(credential.accessToken, itemId, storagePublicUrl(objectPath))
    }

    // Item atualizado no ML: devolve as pictures dele (inclui as novas).
    const detail = await mlGetListingDetail(credential.accessToken, itemId)
    return json(detail.pictures, 201)
  } catch (err) {
    if (err instanceof MarketplaceError) return error(err.message, err.status)
    console.error(`POST /api/marketplace/mercadolivre/listings/${itemId}/pictures failed:`, err)
    return error('Nao foi possivel adicionar as fotos no Mercado Livre', 502)
  }
}
