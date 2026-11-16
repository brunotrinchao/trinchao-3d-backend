// Testa todos endpoints ML que o app usa — identifica qual retorna "Resource deprecated"
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const cred = await prisma.marketplaceCredential.findUnique({ where: { marketplace: 'mercadolivre' } })
const H = { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json' }
const BASE = 'https://api.mercadolibre.com'

const tests = [
  { label: 'GET /users/me', path: '/users/me' },
  { label: 'GET /sites/MLB', path: '/sites/MLB' },
  { label: 'GET /sites/MLB/categories', path: '/sites/MLB/categories' },
  { label: 'GET /items/:id', path: '/items/MLB8003976816' },
  { label: 'GET /items?ids=', path: '/items?ids=MLB8003976816' },
  { label: 'GET /users/me/items/search', path: '/users/me/items/search?limit=5' },
  { label: 'GET /categories/MLB1055/attributes', path: '/categories/MLB1055/attributes' },
  { label: 'GET /sites/MLB/listing_prices', path: '/sites/MLB/listing_prices?price=24.9&currency_id=BRL' },
  { label: 'GET /users/me/shipping_options/free', path: '/users/me/shipping_options/free?dimensions=9x18x2,63&item_price=24.9&listing_type_id=gold_special&mode=me2&condition=new&logistic_type=drop_off&free_shipping=true' },
  { label: 'GET /items/:id/description', path: '/items/MLB8003976816/description' },
]

for (const t of tests) {
  try {
    const r = await fetch(`${BASE}${t.path}`, { headers: H })
    const body = await r.text()
    const deprecated = body.includes('deprecated') || body.includes('no longer allowed')
    console.log(`${deprecated ? '⚠️ DEPRECATED' : r.ok ? '✓' : '✗'} ${r.status} ${t.label}`)
    if (deprecated || !r.ok) console.log(`  → ${body.slice(0, 200)}`)
  } catch (e) {
    console.log(`ERR ${t.label}: ${e.message.slice(0, 80)}`)
  }
}
await prisma.$disconnect()
