"use client";

import { FormEvent, useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { apiFetch } from "../../components/api";
import { formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type SessionUser = {
  id: string;
  email: string | null;
  role: "admin" | "operator";
  mfa: {
    totpEnabled: boolean;
    pendingSetup: boolean;
  };
};

type MfaStatus = {
  totpEnabled: boolean;
  pendingSetup: boolean;
};

type TotpSetupResponse = {
  secret: string;
  otpauthUrl: string;
};

type PasskeyCredential = {
  id: string;
  credentialId: string;
  transports: string[];
  deviceType: string | null;
  backedUp: boolean | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type PasskeyRegistrationOptionsResponse = {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
};

type OidcSettingsResponse = {
  stored: {
    issuerUrl: string | null;
    clientId: string | null;
    redirectUri: string | null;
    clientSecretConfigured: boolean;
  };
  effective: {
    issuerUrl: string | null;
    clientId: string | null;
    redirectUri: string | null;
    configured: boolean;
  };
};

export default function SecurityPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [oidcSettings, setOidcSettings] = useState<OidcSettingsResponse | null>(null);
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcRedirectUri, setOidcRedirectUri] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [clearOidcSecret, setClearOidcSecret] = useState(false);
  const [setupResponse, setSetupResponse] = useState<TotpSetupResponse | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSecurity() {
    setLoading(true);
    setError(null);

    try {
      const [session, status, credentialRows, oidc] = await Promise.all([
        apiFetch<SessionUser>("/api/v1/auth/session"),
        apiFetch<MfaStatus>("/api/v1/auth/mfa/status"),
        apiFetch<PasskeyCredential[]>("/api/v1/auth/webauthn/credentials"),
        apiFetch<OidcSettingsResponse>("/api/v1/settings/oidc")
      ]);

      setUser(session);
      setMfaStatus(status);
      setPasskeys(credentialRows);
      setOidcSettings(oidc);
      setOidcIssuerUrl(oidc.stored.issuerUrl ?? "");
      setOidcClientId(oidc.stored.clientId ?? "");
      setOidcRedirectUri(oidc.stored.redirectUri ?? "");
      setOidcClientSecret("");
      setClearOidcSecret(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load security status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSecurity();
  }, []);

  useEffect(() => {
    let active = true;

    async function generateQrCode() {
      if (!setupResponse?.otpauthUrl) {
        setTotpQrDataUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setupResponse.otpauthUrl, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M"
        });
        if (active) {
          setTotpQrDataUrl(dataUrl);
        }
      } catch {
        if (active) {
          setTotpQrDataUrl(null);
        }
      }
    }

    void generateQrCode();
    return () => {
      active = false;
    };
  }, [setupResponse?.otpauthUrl]);

  async function startTotpSetup() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await apiFetch<TotpSetupResponse>("/api/v1/auth/mfa/totp/setup", {
        method: "POST"
      });
      setSetupResponse(response);
      setMessage("TOTP secret generated. Add it to your authenticator and verify with a code.");
      await loadSecurity();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to start TOTP setup");
    } finally {
      setSaving(false);
    }
  }

  async function verifyTotp(event: FormEvent) {
    event.preventDefault();
    if (!verifyCode.trim()) {
      setError("Verification code is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch("/api/v1/auth/mfa/totp/verify", {
        method: "POST",
        body: { code: verifyCode.trim() }
      });
      setVerifyCode("");
      setSetupResponse(null);
      setMessage("TOTP is now enabled for your account.");
      await loadSecurity();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify TOTP code");
    } finally {
      setSaving(false);
    }
  }

  async function disableTotp(event: FormEvent) {
    event.preventDefault();
    if (!disableCode.trim()) {
      setError("Current MFA code is required to disable TOTP.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch("/api/v1/auth/mfa/totp/disable", {
        method: "POST",
        body: { code: disableCode.trim() }
      });
      setDisableCode("");
      setMessage("TOTP MFA has been disabled.");
      await loadSecurity();
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Unable to disable TOTP");
    } finally {
      setSaving(false);
    }
  }

  async function registerPasskey() {
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support WebAuthn/passkeys.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const optionsResponse = await apiFetch<PasskeyRegistrationOptionsResponse>("/api/v1/auth/webauthn/register/options", {
        method: "POST"
      });

      const registrationResponse = await startRegistration({
        optionsJSON: optionsResponse.options
      });

      await apiFetch("/api/v1/auth/webauthn/register/verify", {
        method: "POST",
        body: {
          challengeId: optionsResponse.challengeId,
          response: registrationResponse
        }
      });

      setMessage("Passkey registration completed.");
      await loadSecurity();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Unable to register passkey");
    } finally {
      setSaving(false);
    }
  }

  async function deletePasskey(id: string) {
    const confirmed = window.confirm("Remove this passkey from your account?");
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch(`/api/v1/auth/webauthn/credentials/${id}`, {
        method: "DELETE"
      });
      setMessage("Passkey removed.");
      await loadSecurity();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove passkey");
    } finally {
      setSaving(false);
    }
  }

  async function saveOidcSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch<OidcSettingsResponse>("/api/v1/settings/oidc", {
        method: "PUT",
        body: {
          issuerUrl: oidcIssuerUrl.trim() || null,
          clientId: oidcClientId.trim() || null,
          redirectUri: oidcRedirectUri.trim() || null,
          ...(oidcClientSecret.trim() ? { clientSecret: oidcClientSecret.trim() } : {}),
          ...(clearOidcSecret ? { clientSecret: null } : {})
        }
      });
      setMessage("OIDC settings saved.");
      await loadSecurity();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save OIDC settings");
    } finally {
      setSaving(false);
    }
  }

  async function copyEffectiveOidcRedirectUri() {
    const effectiveRedirectUri = oidcSettings?.effective.redirectUri;
    if (!effectiveRedirectUri) return;

    try {
      await navigator.clipboard.writeText(effectiveRedirectUri);
      setMessage("Effective OIDC redirect URI copied.");
      setError(null);
    } catch {
      setError("Unable to copy redirect URI. Please copy it manually.");
    }
  }

  return (
    <Shell
      title="Security"
      subtitle="Manage authentication controls, OIDC settings, passkeys, and multi-factor authentication."
      actions={
        <button className="btn btn-secondary" type="button" onClick={() => void loadSecurity()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Email</p>
          <p className="stat-value">{user?.email ?? "n/a"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Role</p>
          <p className="stat-value">{user?.role ?? "n/a"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">TOTP Status</p>
          <p className="stat-value">{mfaStatus?.totpEnabled ? "Enabled" : "Disabled"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Passkeys</p>
          <p className="stat-value">{passkeys.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">OIDC</p>
          <p className="stat-value">{oidcSettings?.effective.configured ? "Configured" : "Incomplete"}</p>
        </article>
      </section>

      <article className="panel p-4">
        <h2 className="m-0 text-lg font-semibold">OIDC SSO Configuration</h2>
        <p className="mb-4 mt-2 text-sm text-slate-600">
          Configure OIDC values saved in Aviary&apos;s database. Redirect URI is optional and defaults from
          <code> AVIARY_DOMAIN</code> when not explicitly set.
        </p>

        <form className="space-y-3" onSubmit={(event) => void saveOidcSettings(event)}>
          <div className="field-wrap">
            <label htmlFor="oidc-issuer-url">Issuer URL</label>
            <input
              className="field"
              id="oidc-issuer-url"
              value={oidcIssuerUrl}
              onChange={(event) => setOidcIssuerUrl(event.target.value)}
              placeholder="https://auth.example.com/application/o/aviary/"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="oidc-client-id">Client ID</label>
            <input
              className="field"
              id="oidc-client-id"
              value={oidcClientId}
              onChange={(event) => setOidcClientId(event.target.value)}
              placeholder="aviary-client"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="oidc-effective-redirect-uri">Effective Redirect URI (copy into your OIDC app)</label>
            <div className="actions">
              <input
                className="field flex-1"
                id="oidc-effective-redirect-uri"
                value={oidcSettings?.effective.redirectUri ?? ""}
                readOnly
                placeholder="Configure AVIARY_DOMAIN or set a redirect URI override below"
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void copyEffectiveOidcRedirectUri()}
                disabled={saving || !oidcSettings?.effective.redirectUri}
              >
                Copy
              </button>
            </div>
          </div>

          <div className="field-wrap">
            <label htmlFor="oidc-redirect-uri">Redirect URI Override (optional)</label>
            <input
              className="field"
              id="oidc-redirect-uri"
              value={oidcRedirectUri}
              onChange={(event) => setOidcRedirectUri(event.target.value)}
              placeholder={oidcSettings?.effective.redirectUri ?? "https://aviary.example.com/api/v1/auth/oidc/callback"}
            />
            <p className="m-0 mt-1 text-xs text-muted">Leave blank to use the derived effective redirect URI.</p>
          </div>

          <div className="field-wrap">
            <label htmlFor="oidc-client-secret">Client Secret (optional)</label>
            <input
              className="field"
              id="oidc-client-secret"
              type="password"
              value={oidcClientSecret}
              onChange={(event) => {
                setOidcClientSecret(event.target.value);
                setClearOidcSecret(false);
              }}
              placeholder="Leave blank to keep existing value"
            />
            {oidcSettings?.stored.clientSecretConfigured ? (
              <p className="m-0 mt-1 text-xs text-slate-500">A client secret is currently stored.</p>
            ) : null}
          </div>

          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save OIDC Settings"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={saving || !oidcSettings?.stored.clientSecretConfigured}
              onClick={() => {
                setOidcClientSecret("");
                setClearOidcSecret(true);
                setMessage("Client secret will be cleared on save.");
                setError(null);
              }}
            >
              Clear Client Secret
            </button>
          </div>
        </form>
      </article>

      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">WebAuthn Passkeys</h2>
          <button className="btn btn-primary" type="button" onClick={() => void registerPasskey()} disabled={saving}>
            {saving ? "Working..." : "Add Passkey"}
          </button>
        </div>

        {passkeys.length === 0 ? (
          <div className="empty">No passkeys enrolled yet.</div>
        ) : (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <div className="passkey-card" key={passkey.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-sm font-semibold passkey-card-title">Credential {passkey.credentialId.slice(0, 12)}...</p>
                  <button className="btn btn-danger" type="button" onClick={() => void deletePasskey(passkey.id)} disabled={saving}>
                    Remove
                  </button>
                </div>
                <p className="m-0 mt-1 text-xs passkey-card-meta">
                  Device: {passkey.deviceType ?? "unknown"} | Backed up: {passkey.backedUp ? "yes" : "no"}
                </p>
                <p className="m-0 mt-1 text-xs passkey-card-submeta">
                  Created {formatDateTime(passkey.createdAt)} | Last used {formatDateTime(passkey.lastUsedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel p-4">
        <h2 className="m-0 text-lg font-semibold">TOTP MFA</h2>
        <p className="mb-4 mt-2 text-sm text-slate-600">
          Use an authenticator app to generate 6-digit one-time codes. This is enforced for password logins when enabled.
        </p>

        {!mfaStatus?.totpEnabled ? (
          <div className="space-y-4">
            <button className="btn btn-primary" type="button" onClick={() => void startTotpSetup()} disabled={saving}>
              {saving ? "Generating..." : "Generate TOTP Secret"}
            </button>

            {setupResponse ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="m-0 text-sm font-semibold">Step 1: Add secret to authenticator app</p>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    {totpQrDataUrl ? (
                      <img
                        src={totpQrDataUrl}
                        width={220}
                        height={220}
                        alt="TOTP setup QR code"
                      />
                    ) : (
                      <div className="grid h-[220px] w-[220px] place-items-center text-xs text-slate-500">
                        Generating QR code...
                      </div>
                    )}
                  </div>
                  <p className="m-0 max-w-sm text-xs text-slate-600">
                    Scan this QR code in your authenticator app. If scanning is unavailable, use the secret and
                    otpauth URL below.
                  </p>
                </div>
                <p className="m-0 text-xs break-all">Secret: {setupResponse.secret}</p>
                <p className="m-0 text-xs break-all">otpauth URL: {setupResponse.otpauthUrl}</p>

                <form className="mt-3 space-y-2" onSubmit={(event) => void verifyTotp(event)}>
                  <div className="field-wrap">
                    <label htmlFor="totp-verify-code">Step 2: Verify code</label>
                    <input
                      className="field"
                      id="totp-verify-code"
                      value={verifyCode}
                      onChange={(event) => setVerifyCode(event.target.value)}
                      inputMode="numeric"
                      placeholder="123456"
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? "Verifying..." : "Enable TOTP"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <form className="space-y-2" onSubmit={(event) => void disableTotp(event)}>
            <p className="m-0 text-sm text-slate-600">
              TOTP is currently enabled. Enter a current code to disable it for this account.
            </p>
            <div className="field-wrap">
              <label htmlFor="totp-disable-code">Current MFA code</label>
              <input
                className="field"
                id="totp-disable-code"
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
                inputMode="numeric"
                placeholder="123456"
              />
            </div>
            <button className="btn btn-danger" type="submit" disabled={saving}>
              {saving ? "Disabling..." : "Disable TOTP"}
            </button>
          </form>
        )}
      </article>
    </Shell>
  );
}
