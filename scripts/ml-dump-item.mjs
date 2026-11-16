// Dump raw ML item response — shipping + attributes only (user wants to see what ML returns)
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const cred = await prisma.marketplaceCredential.findUnique({ where: { marketplace: 'mercadolivre' } })

const itemId = process.argv[2] ?? 'MLB7839303776'
const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
  headers: { Authorization: `Bearer ${cred.accessToken}` },
})

if (!response.ok) {
  console.error(`ML ${response.status}:`, await response.text())
  process.exit(1)
}

const raw = await response.json()

// shipping section
console.log('=== SHIPPING ===')
console.log(JSON.stringify(raw.shipping, null, 2))

// attributes — only dimension-related ones
const dimIds = ['SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT', 'HEIGHT', 'WIDTH', 'LENGTH', 'WEIGHT', 'DIAMETER', 'MODEL']
const dims = (raw.attributes ?? []).filter((a) => dimIds.includes(a.id))
console.log('=== DIM ATTRIBUTES ===')
console.log(JSON.stringify(dims, null, 2))

console.log('=== shipping.dimensions ===')
console.log(raw.shipping?.dimensions ?? '(null/undefined)')

await prisma.$disconnect()
