/*
  Warnings:

  - You are about to drop the column `teeTime` on the `Target` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Target" DROP COLUMN "teeTime",
ADD COLUMN     "autoNext" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teeTimes" TEXT[];
