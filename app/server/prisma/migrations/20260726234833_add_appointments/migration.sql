-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "agendaStartHour" INTEGER NOT NULL DEFAULT 9,
    "agendaEndHour" INTEGER NOT NULL DEFAULT 19,
    "agendaSlotMin" INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT "Settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("businessId", "costPerKm", "emailDigestEnabled", "energyPricePerKwh", "id", "metaMensal", "prolaboreFixo", "prolaboreMode", "prolaborePct", "taxaCredito", "taxaDebito", "taxaPix") SELECT "businessId", "costPerKm", "emailDigestEnabled", "energyPricePerKwh", "id", "metaMensal", "prolaboreFixo", "prolaboreMode", "prolaborePct", "taxaCredito", "taxaDebito", "taxaPix" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_businessId_key" ON "Settings"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Appointment_businessId_idx" ON "Appointment"("businessId");
