# API Summary

Base path: `/api/v1`

- Auth: `/auth/bootstrap-status`, `/auth/local/bootstrap-setup`, `/auth/local/bootstrap-login`, `/auth/logout`, `/auth/session`
- WebAuthn: `/auth/webauthn/authenticate/options`, `/auth/webauthn/authenticate/verify`, `/auth/webauthn/register/options`, `/auth/webauthn/register/verify`, `/auth/webauthn/credentials`, `/auth/webauthn/credentials/:id`
- MFA: `/auth/mfa/status`, `/auth/mfa/totp/setup`, `/auth/mfa/totp/verify`, `/auth/mfa/totp/disable`
- Settings: `/settings/oidc`, `/settings/alerts-backend`
- Servers: `/servers`
- Credentials: `/credentials`
- Server credentials: `/servers/:id/credentials`
- Playbooks: `/playbooks`, `/playbooks/builtin`
- Schedules: `/schedules`
- Wizard automation: `/wizard/automation`
- Jobs: `/jobs`, `/jobs/run-now`, `/jobs/:id/results`
- Alerts: `/alerts`, `/alerts/:id/acknowledge`
- Dashboard: `/dashboard/health`

Notes:
- `GET /auth/bootstrap-status` now includes `setupDefaults` for inferred/stored WebAuthn and TOTP issuer values.
- `POST /auth/local/bootstrap-setup` accepts optional `security` fields (`webauthnRpId`, `webauthnRpName`, `webauthnOrigin`, `totpIssuer`) to persist initial instance config.
- `POST /auth/local/bootstrap-login` may return a passkey MFA challenge (`mfaRequired: "webauthn"`, `options`, `challengeId`) for users with enrolled passkeys; submit the WebAuthn assertion back to the same endpoint to complete login.
- `POST /auth/oidc/login` now resolves OIDC settings from `app_config` (falling back to `OIDC_*` env vars if DB values are absent).
- Alert triggers always write to `notifications`; outbound delivery is configured via `/settings/alerts-backend` (database-only or webhook).
