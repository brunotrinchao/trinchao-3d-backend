// Smoke: pega 1 path de ProductImage e valida a URL pública do Supabase Storage.
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const img = await prisma.productImage.findFirst({ orderBy: { position: 'asc' }, select: { path: true } })
console.log('path no banco:', img?.path)
const url = `https://zndivymalehdubeurkrg.supabase.co/storage/v1/object/public/${img?.path}`
const r = await fetch(url)
console.log('URL pública:', r.status, r.headers.get('content-type'), (r.headers.get('content-length') || '?') + ' bytes')
await prisma.$disconnect()
