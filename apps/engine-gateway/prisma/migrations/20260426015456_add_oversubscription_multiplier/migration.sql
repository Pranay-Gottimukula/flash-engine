/*
  Warnings:

  - You are about to drop the column `secretKey` on the `Client` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[publicKey]` on the table `SaleEvent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `publicKey` to the `SaleEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rsaPrivateKey` to the `SaleEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rsaPublicKey` to the `SaleEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `signingSecret` to the `SaleEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "secretKey";

-- AlterTable
ALTER TABLE "SaleEvent" ADD COLUMN     "oversubscriptionMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "publicKey" TEXT NOT NULL,
ADD COLUMN     "rsaPrivateKey" TEXT NOT NULL,
ADD COLUMN     "rsaPublicKey" TEXT NOT NULL,
ADD COLUMN     "signingSecret" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SaleEvent_publicKey_key" ON "SaleEvent"("publicKey");
