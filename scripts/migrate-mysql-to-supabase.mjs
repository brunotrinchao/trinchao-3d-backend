// Migra dados do MySQL local pro Supabase (Postgres) — one-shot.
// Ordem respeita FKs: Product primeiro, depois as relações. Ids cuid preservados.
// Uso: node scripts/migrate-mysql-to-supabase.mjs
//   MYSQL_SOURCE_URL opcional no .env (default mysql://root:root@localhost:3306/trinchao3d)
//   destino = DATABASE_URL do .env (Supabase)
import 'dotenv/config'
import mysql from 'mysql2/promise'
import pg from 'pg'

const MYSQL_URL = process.env.MYSQL_SOURCE_URL ?? 'mysql://root:root@localhost:3306/trinchao3d'
const PG_URL = process.env.DATABASE_URL

if (!PG_URL?.startsWith('postgresql')) {
  console.error('DATABASE_URL não aponta pra Postgres — abortando.')
  process.exit(1)
}

const mysqlConn = await mysql.createConnection(MYSQL_URL)

async function fetchAll(sql) {
  const [rows] = await mysqlConn.query(sql)
  return rows
}

const products = await fetchAll('SELECT * FROM Product')
const images = await fetchAll('SELECT * FROM ProductImage')
const variations = await fetchAll('SELECT * FROM ProductVariation')
const categoryMaps = await fetchAll('SELECT * FROM ProductCategoryMap')
const listings = await fetchAll('SELECT * FROM MarketplaceListing')
const settings = await fetchAll('SELECT * FROM ProductMarketplaceSettings')
const customFields = await fetchAll('SELECT * FROM ProductCustomField')
const credentials = await fetchAll('SELECT * FROM MarketplaceCredential')

const pgPool = new pg.Pool({ connectionString: PG_URL })

async function insert(table, columns, rows, transform) {
  if (rows.length === 0) return 0
  let n = 0
  for (const row of rows) {
    const values = transform(row)
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    await pgPool.query(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
      values,
    )
    n++
  }
  return n
}

try {
  await pgPool.query('BEGIN')

  const counts = {}
  counts.Product = await insert(
    'Product',
    ['id', 'title', 'description', 'price', 'stock', 'weightGrams', 'heightCm', 'widthCm', 'lengthCm', 'status', 'createdAt', 'updatedAt'],
    products,
    (r) => [r.id, r.title, r.description, r.price, r.stock, r.weightGrams, r.heightCm, r.widthCm, r.lengthCm, r.status, r.createdAt, r.updatedAt],
  )
  counts.ProductImage = await insert(
    'ProductImage',
    ['id', 'productId', 'path', 'position'],
    images,
    (r) => [r.id, r.productId, r.path, r.position],
  )
  counts.ProductVariation = await insert(
    'ProductVariation',
    ['id', 'productId', 'name', 'sku', 'stock'],
    variations,
    (r) => [r.id, r.productId, r.name, r.sku, r.stock],
  )
  counts.ProductCategoryMap = await insert(
    'ProductCategoryMap',
    ['id', 'productId', 'marketplace', 'categoryId', 'categoryPath', 'attributes'],
    categoryMaps,
    (r) => [r.id, r.productId, r.marketplace, r.categoryId, r.categoryPath, r.attributes],
  )
  counts.MarketplaceListing = await insert(
    'MarketplaceListing',
    ['id', 'productId', 'marketplace', 'externalId', 'externalIds', 'status', 'errorMessage', 'publishedAt'],
    listings,
    (r) => [r.id, r.productId, r.marketplace, r.externalId, r.externalIds, r.status, r.errorMessage, r.publishedAt],
  )
  counts.ProductMarketplaceSettings = await insert(
    'ProductMarketplaceSettings',
    ['id', 'productId', 'marketplace', 'title', 'description', 'price', 'listingTypeId', 'estimatedShippingCents', 'freeShipping'],
    settings,
    (r) => [r.id, r.productId, r.marketplace, r.title, r.description, r.price, r.listingTypeId, r.estimatedShippingCents, r.freeShipping],
  )
  counts.ProductCustomField = await insert(
    'ProductCustomField',
    ['id', 'productId', 'key', 'value'],
    customFields,
    (r) => [r.id, r.productId, r.key, r.value],
  )
  counts.MarketplaceCredential = await insert(
    'MarketplaceCredential',
    ['id', 'marketplace', 'accessToken', 'refreshToken', 'shopId', 'expiresAt'],
    credentials,
    (r) => [r.id, r.marketplace, r.accessToken, r.refreshToken, r.shopId, r.expiresAt],
  )

  await pgPool.query('COMMIT')
  console.log('Migrado:', JSON.stringify(counts))
} catch (err) {
  await pgPool.query('ROLLBACK')
  console.error('Falhou — rollback. Detalhe:', err.message)
  process.exitCode = 1
} finally {
  await pgPool.end()
  await mysqlConn.end()
}
