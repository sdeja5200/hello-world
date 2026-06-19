-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "ghlCompanyId" TEXT,
    "ghlLocationId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_ghlLocationId_key" ON "Installation"("ghlLocationId");

-- CreateIndex
CREATE INDEX "Installation_ghlCompanyId_idx" ON "Installation"("ghlCompanyId");

