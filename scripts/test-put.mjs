// Testa PUT com family_name alterado (sem title)
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const cred = await prisma.marketplaceCredential.findUnique({ where: { marketplace: 'mercadolivre' } })

const itemId = 'MLB8003976816'
const raw = await (await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
  headers: { Authorization: `Bearer ${cred.accessToken}` },
})).json()

console.log('family_name atual:', raw.family_name)

// Testa: PUT com family_name igual ao atual (no-op) + outros campos
const body = {
  family_name: raw.family_name,
  price: 24.9,
  available_quantity: 10,
  shipping: { free_shipping: true, mode: raw.shipping?.mode },
}
const put = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.accessToken}` },
  body: JSON.stringify(body),
})
const putBody = await put.json()
console.log('PUT com family_name:', put.status)
if (!put.ok) {
  console.log('error:', putBody.message, '| cause:', putBody.cause)
} else {
  console.log('OK — family_name aceito')
}
await prisma.$disconnect()
