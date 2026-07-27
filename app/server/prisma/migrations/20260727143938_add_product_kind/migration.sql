-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'ml',
    "packageCost" REAL NOT NULL DEFAULT 0,
    "packageQty" REAL NOT NULL DEFAULT 1,
    "salePrice" REAL NOT NULL DEFAULT 0,
    "stock" REAL NOT NULL DEFAULT 0,
    "avgCost" REAL NOT NULL DEFAULT 0,
    "expiresAt" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'operacional',
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("avgCost", "businessId", "expiresAt", "id", "name", "packageCost", "packageQty", "salePrice", "stock", "unit") SELECT "avgCost", "businessId", "expiresAt", "id", "name", "packageCost", "packageQty", "salePrice", "stock", "unit" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
