// Migra fotos de backend/uploads pro Supabase Storage (bucket `products`) e reescreve
// os paths de ProductImage (`uploads/<pid>/<f>` → `products/<pid>/<f>`). Idempotente:
// arquivos já no bucket são sobrescritos (x-upsert), paths sem prefixo uploads/ são pulados.
// Uso: node scripts/migrate-uploads-to-storage.mjs
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads')
const BUCKET = 'products'
const SUPABASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

if (!SUPABASE || !KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY ausentes no .env')
  process.exit(1)
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml',
}

function contentTypeFor(file) {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

async function storageUpload(objectPath, buffer) {
  const response = await fetch(`${SUPABASE}/storage/v1/object/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': contentTypeFor(objectPath),
      'x-upsert': 'true',
    },
    body: new Uint8Array(buffer),
  })
  if (!response.ok) throw new Error(`Storage ${response.status}: ${(await response.text()).slice(0, 150)}`)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const images = await prisma.productImage.findMany({ select: { id: true, productId: true, path: true } })
const toMigrate = images.filter((img) => img.path.startsWith('uploads/'))
console.log(`imagens: ${images.length} | a migrar: ${toMigrate.length}`)

let ok = 0
let fail = 0
for (const img of toMigrate) {
  const filename = img.path.split('/').pop() ?? ''
  const local = path.join(UPLOADS_ROOT, img.productId, filename)
  try {
    const buffer = await readFile(local)
    const objectPath = `${BUCKET}/${img.productId}/${filename}`
    await storageUpload(objectPath, buffer)
    await prisma.productImage.update({ where: { id: img.id }, data: { path: objectPath } })
    ok += 1
  } catch (err) {
    fail += 1
    console.error(`falhou ${img.path}:`, String(err?.message ?? err).slice(0, 120))
  }
}

const remaining = await prisma.productImage.count({ where: { path: { startsWith: 'uploads/' } } })
console.log(`migradas: ${ok} | falhas: ${fail} | restantes em uploads/: ${remaining}`)
await prisma.$disconnect()
process.exit(fail > 0 ? 1 : 0)
