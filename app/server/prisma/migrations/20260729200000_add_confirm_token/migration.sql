ALTER TABLE "Appointment" ADD COLUMN "confirmToken" TEXT;
UPDATE "Appointment" SET "confirmToken" = lower(hex(randomblob(16)));
CREATE UNIQUE INDEX "Appointment_confirmToken_key" ON "Appointment"("confirmToken");
