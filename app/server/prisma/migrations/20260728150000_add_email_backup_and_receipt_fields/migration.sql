-- Additive only: existing rows get the defaults.
ALTER TABLE "Settings" ADD COLUMN "emailBackupEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "receiptDoc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "receiptPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "receiptAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "receiptCity" TEXT NOT NULL DEFAULT '';
