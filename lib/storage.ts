import { contentTypeFor } from './uploads'

/** Supabase Storage — bucket `products` (público pra leitura). Upload/delete usam a
 * service key no servidor; leitura é URL pública direta (sem túnel, sem backend). */

export const STORAGE_BUCKET = 'products'

function supabaseUrl(): string {
  const raw = process.env.SUPABASE_URL
  if (!raw) throw new Error('SUPABASE_URL nao configurado no .env')
  return raw.replace(/\/+$/, '')
}

function serviceKey(): string {
  const raw = process.env.SUPABASE_SERVICE_KEY
  if (!raw) throw new Error('SUPABASE_SERVICE_KEY nao configurado no .env')
  return raw
}

/** URL pública de um objeto do bucket (chave no formato `products/<productId>/<file>`). */
export function storagePublicUrl(objectPath: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${objectPath.replace(/^\/+/, '')}`
}

/** Objeto path de uma imagem de produto: `products/<productId>/<filename>`. */
export function imageObjectPath(productId: string, filename: string): string {
  return `${STORAGE_BUCKET}/${productId}/${filename}`
}

/** Envia um arquivo pro bucket (upsert — sobrescreve mesmo caminho). */
export async function storageUpload(objectPath: string, buffer: Buffer): Promise<void> {
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': contentTypeFor(objectPath),
      'x-upsert': 'true',
    },
    body: new Uint8Array(buffer),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Falha no upload pro Storage (${response.status}): ${body.slice(0, 200)}`)
  }
}

/** Remove um objeto do bucket. Não-falha em 404 (já removido). */
export async function storageDelete(objectPath: string): Promise<void> {
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/${objectPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serviceKey()}` },
  })
  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => '')
    throw new Error(`Falha ao remover do Storage (${response.status}): ${body.slice(0, 200)}`)
  }
}
