-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER_ADMIN', 'LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "OnboardingTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "timezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "yesterday" TEXT NOT NULL,
    "today" TEXT NOT NULL,
    "blockers" TEXT NOT NULL,
    "submittedAtUtc" TIMESTAMPTZ(6) NOT NULL,
    "timezone" TEXT NOT NULL,
    "localStandupDate" DATE NOT NULL,
    "editedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Standup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "OnboardingTokenType" NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "replacedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "standupDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_isActive_idx" ON "User"("teamId", "isActive");

-- CreateIndex
CREATE INDEX "Standup_userId_submittedAtUtc_idx" ON "Standup"("userId", "submittedAtUtc" DESC);

-- CreateIndex
CREATE INDEX "Standup_teamId_localStandupDate_idx" ON "Standup"("teamId", "localStandupDate");

-- CreateIndex
CREATE UNIQUE INDEX "Standup_userId_localStandupDate_key" ON "Standup"("userId", "localStandupDate");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingToken_tokenHash_key" ON "OnboardingToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OnboardingToken_userId_idx" ON "OnboardingToken"("userId");

-- CreateIndex
CREATE INDEX "OnboardingToken_expiresAt_idx" ON "OnboardingToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRefreshToken_tokenHash_key" ON "SessionRefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRefreshToken_replacedById_key" ON "SessionRefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "SessionRefreshToken_userId_idx" ON "SessionRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "SessionRefreshToken_expiresAt_idx" ON "SessionRefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSummary_teamId_standupDate_key" ON "AiSummary"("teamId", "standupDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standup" ADD CONSTRAINT "Standup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standup" ADD CONSTRAINT "Standup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingToken" ADD CONSTRAINT "OnboardingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingToken" ADD CONSTRAINT "OnboardingToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRefreshToken" ADD CONSTRAINT "SessionRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRefreshToken" ADD CONSTRAINT "SessionRefreshToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRefreshToken" ADD CONSTRAINT "SessionRefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "SessionRefreshToken"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
