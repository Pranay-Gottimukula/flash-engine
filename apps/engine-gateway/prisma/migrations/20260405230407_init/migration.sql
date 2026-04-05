-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueAttempt" (
    "id" TEXT NOT NULL,
    "saleEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "jti" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRelease" (
    "id" TEXT NOT NULL,
    "saleEventId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsedJti" (
    "jti" TEXT NOT NULL,
    "saleEventId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsedJti_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_publicKey_key" ON "Client"("publicKey");

-- CreateIndex
CREATE INDEX "QueueAttempt_saleEventId_idx" ON "QueueAttempt"("saleEventId");

-- CreateIndex
CREATE INDEX "QueueAttempt_saleEventId_result_idx" ON "QueueAttempt"("saleEventId", "result");

-- AddForeignKey
ALTER TABLE "SaleEvent" ADD CONSTRAINT "SaleEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueAttempt" ADD CONSTRAINT "QueueAttempt_saleEventId_fkey" FOREIGN KEY ("saleEventId") REFERENCES "SaleEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRelease" ADD CONSTRAINT "TicketRelease_saleEventId_fkey" FOREIGN KEY ("saleEventId") REFERENCES "SaleEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsedJti" ADD CONSTRAINT "UsedJti_saleEventId_fkey" FOREIGN KEY ("saleEventId") REFERENCES "SaleEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
