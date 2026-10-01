-- Email magic-link second factor after password login (Pharmacist Admin / Pharmacist).
CREATE TABLE "LoginEmailChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginEmailChallenge_tokenHash_key" ON "LoginEmailChallenge"("tokenHash");
CREATE INDEX "LoginEmailChallenge_userId_createdAt_idx" ON "LoginEmailChallenge"("userId", "createdAt");
CREATE INDEX "LoginEmailChallenge_expiresAt_idx" ON "LoginEmailChallenge"("expiresAt");

ALTER TABLE "LoginEmailChallenge" ADD CONSTRAINT "LoginEmailChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
