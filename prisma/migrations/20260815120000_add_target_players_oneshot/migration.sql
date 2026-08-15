-- Target: default player group (snapshot) + one-off booking option
ALTER TABLE "Target" ADD COLUMN "playerSet" JSONB;
ALTER TABLE "Target" ADD COLUMN "oneShot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Target" ADD COLUMN "oneShotDate" TIMESTAMP(3);
