// Testa PrismaPg contra o pooler Supabase (aws-1) com variantes de sslmode — one-shot.
// Uso: node scripts/test-pooler.mjs
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const mUrl = process.env.DATABASE_URL.match(/^postgresql:\/\/([^:]+):([^@]+)@/)
const pass = mUrl[2]
const base = `postgresql://postgres.zndivymalehdubeurkrg:${pass}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`

for (const [label, url] of [
  ['base', base],
  ['pgbouncer params', `${base}?pgbouncer=true&connection_limit=10`],
  ['sslmode=require', `${base}?sslmode=require`],
]) {
  try {
    const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    const r = await p.product.count()
    console.log(`${label} → OK Product=${r}`)
    await p.$disconnect()
  } catch (e) {
    console.log(`${label} → ${(e.message || '').split('\n')[0].slice(0, 110)}`)
  }
}
process.exit(0)
