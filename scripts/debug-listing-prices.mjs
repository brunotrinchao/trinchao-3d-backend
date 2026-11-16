// Debug: chama listing_prices direto e mostra response completo
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const cred = await prisma.marketplaceCredential.findUnique({ where: { marketplace: 'mercadolivre' } })

// testa com params mínimos (como nossa impl atual)
const url1 = 'https://api.mercadolibre.com/sites/MLB/listing_prices?price=24.9&category_id=MLB1730&listing_type_id=gold_special&currency_id=BRL'
const r1 = await fetch(url1, { headers: { Authorization: `Bearer ${cred.accessToken}` } })
const b1 = await r1.json()
console.log('sem logistic_type:', r1.status)
if (!r1.ok) console.log(JSON.stringify(b1).slice(0, 300))
else console.log(JSON.stringify(b1).slice(0, 200))

// testa com params completos
const url2 = 'https://api.mercadolibre.com/sites/MLB/listing_prices?price=24.9&category_id=MLB1730&listing_type_id=gold_special&currency_id=BRL&logistic_type=drop_off&shipping_modes=me2'
const r2 = await fetch(url2, { headers: { Authorization: `Bearer ${cred.accessToken}` } })
const b2 = await r2.json()
console.log('com logistic_type + shipping_modes:', r2.status)
if (!r2.ok) console.log(JSON.stringify(b2).slice(0, 300))
else console.log(JSON.stringify(b2).slice(0, 300))

// testa sem listing_type_id (filtra por preço apenas)
const url3 = 'https://api.mercadolibre.com/sites/MLB/listing_prices?price=24.9&currency_id=BRL'
const r3 = await fetch(url3, { headers: { Authorization: `Bearer ${cred.accessToken}` } })
const b3 = await r3.json()
console.log('só price+currency:', r3.status)
if (!r3.ok) console.log(JSON.stringify(b3).slice(0, 300))
else console.log(JSON.stringify(b3).slice(0, 200))

await prisma.$disconnect()
