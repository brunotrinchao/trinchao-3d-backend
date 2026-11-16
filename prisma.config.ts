import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    // Supabase: runtime usa pooler (porta 6543) — migrations exigem a conexão direta (5432).
    directUrl: env('DIRECT_URL'),
  },
})
