-- CreateEnum
CREATE TYPE "AlertBackendType" AS ENUM ('database', 'webhook');

ALTER TABLE "app_config"
  ADD COLUMN "oidc_issuer_url" TEXT,
  ADD COLUMN "oidc_client_id" TEXT,
  ADD COLUMN "oidc_client_secret" TEXT,
  ADD COLUMN "oidc_redirect_uri" TEXT,
  ADD COLUMN "alerts_backend_type" "AlertBackendType" NOT NULL DEFAULT 'database',
  ADD COLUMN "alerts_backend_webhook_url" TEXT,
  ADD COLUMN "alerts_backend_auth_header" TEXT;
