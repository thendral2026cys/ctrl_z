-- DropIndex
DROP INDEX "Session_userId_key";

-- AlterTable
ALTER TABLE "FinalSubmission" ALTER COLUMN "updatedAt" DROP DEFAULT;
