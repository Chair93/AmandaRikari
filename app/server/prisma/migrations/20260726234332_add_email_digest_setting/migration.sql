-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "energyPricePerKwh" REAL NOT NULL DEFAULT 0,
    "costPerKm" REAL NOT NULL DEFAULT 0,
    "prolaboreMode" TEXT NOT NULL DEFAULT 'pct',
    "prolaborePct" REAL NOT NULL DEFAULT 0,
    "prolaboreFixo" REAL NOT NULL DEFAULT 0,
    "metaMensal" REAL NOT NULL DEFAULT 0,
    "taxaCredito" REAL NOT NULL DEFAULT 0,
    "taxaDebito" REAL NOT NULL DEFAULT 0,
    "taxaPix" REAL NOT NULL DEFAULT 0,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("businessId", "costPerKm", "energyPricePerKwh", "id", "metaMensal", "prolaboreFixo", "prolaboreMode", "prolaborePct", "taxaCredito", "taxaDebito", "taxaPix") SELECT "businessId", "costPerKm", "energyPricePerKwh", "id", "metaMensal", "prolaboreFixo", "prolaboreMode", "prolaborePct", "taxaCredito", "taxaDebito", "taxaPix" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_businessId_key" ON "Settings"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
