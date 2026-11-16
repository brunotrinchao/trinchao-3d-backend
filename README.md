# backend — trinchao-3d

API-only em Next.js (App Router) + TypeScript + Prisma + MySQL. Nenhuma pagina e
renderizada: todas as rotas vivem em `app/api/**/route.ts` (mais a rota estatica
`app/uploads/[productId]/[filename]/route.ts`). Roda em `http://localhost:3001`.

Implementa exatamente o contrato de `../CONTRACT.md`.

## Configuracao

```bash
cp .env.example .env
# preencha DATABASE_URL e as credenciais dos marketplaces
npm install
```

Variaveis (`.env`):

| Variavel | Uso |
| --- | --- |
| `DATABASE_URL` | conexao MySQL |
| `MERCADOLIVRE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | OAuth2 do Mercado Livre |
| `SHOPEE_PARTNER_ID` / `_PARTNER_KEY` / `_REDIRECT_URI` | OAuth2 + assinatura HMAC da Shopee |
| `FRONTEND_ORIGIN` | origin liberado no CORS (dev: `http://localhost:5173`) |

## Banco

Com o MySQL rodando e `DATABASE_URL` preenchida:

```bash
npx prisma migrate dev     # cria/aplica as migrations
npx prisma generate        # gera o client (nao precisa de banco)
```

## Rodar

```bash
npm run dev     # next dev -p 3001
npm run build
npm start       # next start -p 3001
```

## Rotas

Produtos: `GET|POST /api/products`, `GET|PUT|DELETE /api/products/:id`.
Imagens: `POST /api/products/:id/images` (multipart, campo `images`, repetivel),
`DELETE /api/products/:id/images/:imageId`.
Variacoes: `POST /api/products/:id/variations`, `PUT|DELETE /api/products/:id/variations/:variationId`.
Categorias: `GET /api/categories/mercadolivre?q=`, `GET /api/categories/shopee?q=`,
`PUT /api/products/:id/category-map`.
Publicacao: `POST /api/products/:id/publish/mercadolivre`, `POST /api/products/:id/publish/shopee`.
OAuth: `GET /api/auth/{mercadolivre,shopee}` e `.../callback`.
Arquivos: `GET /uploads/:productId/:filename`.

Toda rota responde `OPTIONS` e envia os headers de CORS — helper unico em `lib/cors.ts`.

## Shopee exige OAuth primeiro

A Shopee nao tem endpoint publico de taxonomia nem de publicacao. Enquanto nao houver
`MarketplaceCredential` salva:

- `GET /api/categories/shopee` responde **501** com a mensagem de que requer autenticacao OAuth.
- `POST /api/products/:id/publish/shopee` responde **400** com `conecte sua conta via /api/auth/shopee primeiro`.

Depois do `GET /api/auth/shopee` → callback, a rota de categorias usa `GetCategory`
(`/api/v2/product/get_category`) e a de publicacao usa `/api/v2/product/add_item`, ambas
assinadas em HMAC-SHA256 com o `partner_key` (`lib/marketplace/shopee.ts`).

O Mercado Livre segue o mesmo principio na publicacao: sem credencial salva,
`POST /api/products/:id/publish/mercadolivre` responde **400** com
`conecte sua conta via /api/auth/mercadolivre primeiro`.

## Decisoes tomadas (pontos ambiguos do contrato)

- **Uploads em disco**, nao em cloud: `backend/uploads/<productId>/<filename>`; `ProductImage.path`
  guarda `uploads/<productId>/<filename>`. O diretorio esta no `.gitignore`.
- **Campo do multipart**: `images` (repetivel). `image` e `file` tambem sao aceitos.
  A resposta e o array dos `ProductImage` criados (201).
- **Formato das categorias**: `[{ id, path }]`, onde `path` ja e o texto legivel que vai
  direto para `categoryPath` do `PUT /api/products/:id/category-map`.
- **`shop_id` da Shopee**: o contrato nao tem coluna para ele, e toda chamada de loja da
  Shopee exige. Guardamos `{"refreshToken": ..., "shopId": ...}` serializado na coluna
  `MarketplaceCredential.refreshToken` (`@db.Text`). Para o Mercado Livre a coluna guarda
  o refresh token puro.
- **Categorias do Mercado Livre**: o ML passou a recusar chamadas anonimas em
  `/sites/MLB/categories` e `/sites/MLB/domain_discovery/search` (403 `PolicyAgent`).
  A rota envia o `accessToken` salvo como Bearer quando existe; sem credencial a resposta
  propaga 401/403 pedindo para conectar a conta.
- **Erro de publicacao**: `MarketplaceListing` e gravado com `status="failed"` e
  `errorMessage`, e a resposta devolve `{ error, listing }`. No sucesso, `status="published"`,
  `externalId`, `publishedAt`, e o `Product.status` vira `published`.
- **Imagens nos payloads**: enviadas como URLs publicas deste backend
  (`<origin>/uploads/...`). Em `localhost` os marketplaces nao conseguem baixa-las — em
  producao e preciso um host publico (e, na Shopee, upload previo via `media_space`).
- **Validacao**: zod em `lib/validation.ts`; erro de payload responde 422 com `details`.
- **Prisma 7**: a URL do banco vive em `prisma.config.ts` (nao mais no `schema.prisma`) e o
  client usa o driver adapter `@prisma/adapter-mariadb`. O client e instanciado de forma
  preguicosa em `lib/prisma.ts` para que `next build` nao exija `DATABASE_URL`.
- Sem autenticacao de usuario e sem sync reverso de status, conforme o contrato.
# trinchao-3d-backend
