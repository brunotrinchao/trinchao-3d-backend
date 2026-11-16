import path from 'node:path'

/** Diretorio raiz dos uploads: `backend/uploads`. */
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads')

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
}

export function contentTypeFor(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

/** Remove qualquer componente de path e caracteres perigosos do nome do arquivo. */
export function safeFilename(original: string): string {
  const base = path.basename(original).replace(/[^a-zA-Z0-9._-]/g, '_')
  return base.replace(/^\.+/, '') || 'file'
}

/**
 * Resolve um arquivo dentro de UPLOADS_ROOT, bloqueando path traversal.
 * Retorna `null` se o caminho escapar do diretorio de uploads.
 */
export function resolveUploadPath(...segments: string[]): string | null {
  const safe = segments.map((segment) => safeFilename(segment))
  const resolved = path.resolve(UPLOADS_ROOT, ...safe)
  const root = path.resolve(UPLOADS_ROOT)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}
