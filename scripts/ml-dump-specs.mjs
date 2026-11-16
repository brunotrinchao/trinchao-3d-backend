// Dump product-spec attributes for an ML item
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const cred = await prisma.marketplaceCredential.findUnique({ where: { marketplace: 'mercadolivre' } })

const itemId = process.argv[2] ?? 'MLB7839303776'
const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
  headers: { Authorization: `Bearer ${cred.accessToken}` },
})

const raw = await response.json()
const ids = ['HEIGHT', 'WIDTH', 'LENGTH', 'WEIGHT', 'DIAMETER', 'MODEL', 'BRAND', 'MATERIAL']
for (const a of (raw.attributes ?? [])) {
  if (ids.includes(a.id)) {
    const v = (a.values ?? [])[0]
    console.log(`${a.id} | ${a.name} | valor: ${v?.name ?? '(sem valor)'}`)
  }
}
await prisma.$disconnect()
