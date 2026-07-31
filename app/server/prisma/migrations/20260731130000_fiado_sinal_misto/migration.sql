-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "parcelas2" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "payment2" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "valor2" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmou" BOOLEAN NOT NULL DEFAULT false,
    "confirmToken" TEXT,
    "note" TEXT,
    "txId" TEXT,
    "sinalTxId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_txId_fkey" FOREIGN KEY ("txId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_sinalTxId_fkey" FOREIGN KEY ("sinalTxId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("businessId", "clientId", "confirmToken", "confirmou", "createdAt", "date", "durationMin", "id", "note", "serviceId", "status", "time", "txId") SELECT "businessId", "clientId", "confirmToken", "confirmou", "createdAt", "date", "durationMin", "id", "note", "serviceId", "status", "time", "txId" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE UNIQUE INDEX "Appointment_confirmToken_key" ON "Appointment"("confirmToken");
CREATE INDEX "Appointment_businessId_idx" ON "Appointment"("businessId");
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "due" TEXT NOT NULL,
    "categoryId" TEXT,
    "clientId" TEXT,
    "note" TEXT,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TEXT,
    "txId" TEXT,
    "recId" TEXT,
    "fiadoOf" TEXT,
    "recMonth" TEXT,
    "sala" BOOLEAN NOT NULL DEFAULT false,
    "packageId" TEXT,
    CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bill_fiadoOf_fkey" FOREIGN KEY ("fiadoOf") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("amount", "businessId", "categoryId", "clientId", "desc", "due", "id", "kind", "note", "packageId", "recId", "recMonth", "recorrente", "sala", "settled", "settledAt", "txId") SELECT "amount", "businessId", "categoryId", "clientId", "desc", "due", "id", "kind", "note", "packageId", "recId", "recMonth", "recorrente", "sala", "settled", "settledAt", "txId" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE INDEX "Bill_businessId_idx" ON "Bill"("businessId");
CREATE UNIQUE INDEX "Bill_recId_recMonth_key" ON "Bill"("recId", "recMonth");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

