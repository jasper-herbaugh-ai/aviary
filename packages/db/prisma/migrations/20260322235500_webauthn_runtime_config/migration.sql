ALTER TABLE "webauthn_challenges"
  ADD COLUMN "rp_id" TEXT,
  ADD COLUMN "origin" TEXT;

ALTER TABLE "app_config"
  ADD COLUMN "webauthn_rp_id" TEXT,
  ADD COLUMN "webauthn_rp_name" TEXT,
  ADD COLUMN "webauthn_origin" TEXT;
