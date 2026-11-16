-- CreateTable
CREATE TABLE `ProductMarketplaceSettings` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `marketplace` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NULL,
    `listingTypeId` VARCHAR(191) NULL,
    `estimatedShippingCents` INTEGER NULL,

    UNIQUE INDEX `ProductMarketplaceSettings_productId_marketplace_key`(`productId`, `marketplace`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductMarketplaceSettings` ADD CONSTRAINT `ProductMarketplaceSettings_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
