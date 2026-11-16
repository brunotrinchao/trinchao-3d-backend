import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL nao configurado no .env')

  const client = new PrismaClient({ adapter: new PrismaMariaDb(url) })
  globalForPrisma.prisma = client
  return client
}

/**
 * Cliente preguicoso: o PrismaClient so e instanciado no primeiro acesso, para que
 * o `next build` nao exija DATABASE_URL. Tambem evita multiplas conexoes no HMR.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient() as unknown as Record<string | symbol, unknown>
    const value = client[property]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
