ALTER TABLE "Settings" ADD COLUMN "taxaCreditoParcelas" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Transaction" ADD COLUMN "parcelas" INTEGER;
