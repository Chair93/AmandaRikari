-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClientPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'anamnese',
    "txId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPhoto_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientPhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientPhoto_txId_fkey" FOREIGN KEY ("txId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClientPhoto" ("businessId", "clientId", "createdAt", "id", "mime", "size", "tipo") SELECT "businessId", "clientId", "createdAt", "id", "mime", "size", "tipo" FROM "ClientPhoto";
DROP TABLE "ClientPhoto";
ALTER TABLE "new_ClientPhoto" RENAME TO "ClientPhoto";
CREATE INDEX "ClientPhoto_clientId_idx" ON "ClientPhoto"("clientId");
CREATE INDEX "ClientPhoto_businessId_idx" ON "ClientPhoto"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

