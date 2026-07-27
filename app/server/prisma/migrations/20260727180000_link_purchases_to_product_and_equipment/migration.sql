-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "categoryId" TEXT NOT NULL,
    "clientId" TEXT,
    "serviceId" TEXT,
    "distanciaKm" REAL,
    "variableCost" REAL,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "capital" TEXT,
    "capitalKind" TEXT,
    "socio" TEXT,
    "payment" TEXT,
    "feeOf" TEXT,
    "prolabore" BOOLEAN NOT NULL DEFAULT false,
    "estoque" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "equipmentId" TEXT,
    "cashOnly" BOOLEAN NOT NULL DEFAULT false,
    "accrualOnly" BOOLEAN NOT NULL DEFAULT false,
    "packageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accrualOnly", "amount", "ativo", "businessId", "capital", "capitalKind", "cashOnly", "categoryId", "clientId", "createdAt", "date", "distanciaKm", "estoque", "feeOf", "id", "note", "packageId", "payment", "prolabore", "serviceId", "socio", "type", "variableCost") SELECT "accrualOnly", "amount", "ativo", "businessId", "capital", "capitalKind", "cashOnly", "categoryId", "clientId", "createdAt", "date", "distanciaKm", "estoque", "feeOf", "id", "note", "packageId", "payment", "prolabore", "serviceId", "socio", "type", "variableCost" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_businessId_idx" ON "Transaction"("businessId");
CREATE INDEX "Transaction_businessId_date_idx" ON "Transaction"("businessId", "date");
CREATE INDEX "Transaction_clientId_idx" ON "Transaction"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Backfill the new links for purchases booked before this column existed.
-- Those rows only ever recorded the product in the note text, so this matches
-- on the exact prefix "+ Entrada"/"+ Compra" writes. Prefix comparison via
-- substr rather than LIKE, so a name containing % or _ isn't treated as a
-- wildcard. Best-effort by nature: a product renamed since its purchase won't
-- match, and stays unlinked (which only means its old purchase survives a
-- later delete — never that the wrong row is touched).
UPDATE "Transaction"
SET "productId" = (
  SELECT p."id" FROM "Product" p
  WHERE p."businessId" = "Transaction"."businessId"
    AND substr("Transaction"."note", 1, length('Compra de estoque: ' || p."name" || ' x'))
        = 'Compra de estoque: ' || p."name" || ' x'
  LIMIT 1
)
WHERE "estoque" = true AND "note" IS NOT NULL AND "productId" IS NULL;

UPDATE "Transaction"
SET "equipmentId" = (
  SELECT e."id" FROM "Equipment" e
  WHERE e."businessId" = "Transaction"."businessId"
    AND substr("Transaction"."note", 1, length('Compra de bem: ' || e."name" || ' x'))
        = 'Compra de bem: ' || e."name" || ' x'
  LIMIT 1
)
WHERE "ativo" = true AND "note" IS NOT NULL AND "equipmentId" IS NULL;
