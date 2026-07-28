-- Additive only: existing rows get the default, nothing is rewritten.
ALTER TABLE "Product" ADD COLUMN "lowStockAt" REAL NOT NULL DEFAULT 1;
