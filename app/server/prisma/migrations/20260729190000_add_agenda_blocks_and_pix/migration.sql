ALTER TABLE "Settings" ADD COLUMN "pixKey" TEXT NOT NULL DEFAULT '';
CREATE TABLE "AgendaBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL DEFAULT '00:00',
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AgendaBlock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgendaBlock_businessId_date_idx" ON "AgendaBlock"("businessId", "date");
