-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'utensilio',
    "qty" REAL NOT NULL DEFAULT 1,
    "cost" REAL NOT NULL DEFAULT 0,
    "usefulUses" REAL NOT NULL DEFAULT 0,
    "kwh" REAL NOT NULL DEFAULT 0,
    "depMode" TEXT NOT NULL DEFAULT 'uso',
    "vidaMeses" INTEGER NOT NULL DEFAULT 0,
    "ativadoEm" TEXT,
    "baixas" REAL NOT NULL DEFAULT 0,
    "perdaBaixa" REAL NOT NULL DEFAULT 0,
    "baixadoEm" TEXT,
    CONSTRAINT "Equipment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Equipment" ("baixadoEm", "baixas", "businessId", "cost", "id", "kind", "kwh", "name", "perdaBaixa", "qty", "usefulUses") SELECT "baixadoEm", "baixas", "businessId", "cost", "id", "kind", "kwh", "name", "perdaBaixa", "qty", "usefulUses" FROM "Equipment";
DROP TABLE "Equipment";
ALTER TABLE "new_Equipment" RENAME TO "Equipment";
CREATE INDEX "Equipment_businessId_idx" ON "Equipment"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

