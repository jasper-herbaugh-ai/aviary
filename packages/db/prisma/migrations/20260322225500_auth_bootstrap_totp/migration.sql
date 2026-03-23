ALTER TABLE "users"
  ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totp_secret_encrypted" TEXT,
  ADD COLUMN "totp_pending_secret_encrypted" TEXT;
