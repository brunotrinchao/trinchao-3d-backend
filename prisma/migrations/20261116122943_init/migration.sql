-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCustomField" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ProductCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,

    CONSTRAINT "ProductVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategoryMap" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryPath" TEXT NOT NULL,
    "attributes" JSONB,

    CONSTRAINT "ProductCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "externalId" TEXT,
    "externalIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMarketplaceSettings" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "listingTypeId" TEXT,
    "estimatedShippingCents" INTEGER,
    "freeShipping" BOOLEAN,

    CONSTRAINT "ProductMarketplaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCredential" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "shopId" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCustomField_productId_key_key" ON "ProductCustomField"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategoryMap_productId_marketplace_key" ON "ProductCategoryMap"("productId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_productId_marketplace_key" ON "MarketplaceListing"("productId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketplaceSettings_productId_marketplace_key" ON "ProductMarketplaceSettings"("productId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCredential_marketplace_key" ON "MarketplaceCredential"("marketplace");

-- AddForeignKey
ALTER TABLE "ProductCustomField" ADD CONSTRAINT "ProductCustomField_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariation" ADD CONSTRAINT "ProductVariation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategoryMap" ADD CONSTRAINT "ProductCategoryMap_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMarketplaceSettings" ADD CONSTRAINT "ProductMarketplaceSettings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
