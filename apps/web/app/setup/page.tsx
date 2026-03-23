"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "../../components/api";
import { getAuthToken, storeToken } from "../../components/auth";

type BootstrapStatus = {
  localBootstrapEnabled: boolean;
  hasUsers: boolean;
  setupRequired: boolean;
  bootstrapAdminEmail: string;
  setupDefaults: {
    webauthnRpId: string | null;
    webauthnRpName: string;
    webauthnOrigin: string | null;
    totpIssuer: string;
  };
};

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("change-me");
  const [confirmPassword, setConfirmPassword] = useState("change-me");
  const [webauthnRpId, setWebauthnRpId] = useState("");
  const [webauthnRpName, setWebauthnRpName] = useState("Aviary");
  const [webauthnOrigin, setWebauthnOrigin] = useState("");
  const [totpIssuer, setTotpIssuer] = useState("Aviary");
  const [showSecurity, setShowSecurity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthToken()) {
      router.replace("/dashboard");
      return;
    }

    async function loadStatus() {
      try {
        const response = await fetch(`${apiBase()}/api/v1/auth/bootstrap-status`, { cache: "no-store" });
        if (!response.ok) {
          setError(`Unable to check setup status (${response.status})`);
          return;
        }

        const body = (await response.json()) as BootstrapStatus;
        setAllowed(body.setupRequired);
        setEmail(body.bootstrapAdminEmail || "admin@example.com");
        setWebauthnRpId(body.setupDefaults?.webauthnRpId ?? "");
        setWebauthnRpName(body.setupDefaults?.webauthnRpName ?? "Aviary");
        setWebauthnOrigin(body.setupDefaults?.webauthnOrigin ?? "");
        setTotpIssuer(body.setupDefaults?.totpIssuer ?? "Aviary");

        if (!body.setupRequired) {
          router.replace("/sign-in");
        }
      } finally {
        setCheckingStatus(false);
      }
    }

    void loadStatus();
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBase()}/api/v1/auth/local/bootstrap-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          security: {
            webauthnRpId: webauthnRpId.trim() || null,
            webauthnRpName: webauthnRpName.trim() || null,
            webauthnOrigin: webauthnOrigin.trim() || null,
            totpIssuer: totpIssuer.trim() || null
          }
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Setup failed (${response.status})`);
        return;
      }

      const body = (await response.json()) as { token: string };
      storeToken(body.token);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (checkingStatus) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4">
        <article className="panel w-full p-6 text-sm text-slate-600">Checking setup status...</article>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4">
        <article className="panel w-full p-6">
          <h1 className="m-0 text-2xl font-bold">Setup Complete</h1>
          <p className="mt-2 text-sm text-slate-600">Bootstrap setup is already complete. Use the sign-in page.</p>
        </article>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4">
      <article className="panel w-full p-6">
        <h1 className="m-0 text-2xl font-bold">Initial Setup</h1>
        <p className="mb-5 mt-2 text-sm text-slate-600">
          Create the first admin account and save security defaults for this Aviary instance.
        </p>

        <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <div className="field-wrap">
            <label htmlFor="setup-email">Admin Email</label>
            <input
              className="field"
              id="setup-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="setup-password">Password</label>
            <input
              className="field"
              id="setup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="setup-password-confirm">Confirm Password</label>
            <input
              className="field"
              id="setup-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-sm font-semibold">Security Defaults</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowSecurity((value) => !value)}
              >
                {showSecurity ? "Hide" : "Customize"}
              </button>
            </div>
            <p className="mb-0 mt-2 text-xs text-slate-600">
              Defaults are auto-detected and will be saved in the database. Customize only if you run behind a proxy or
              different external domain.
            </p>

            {showSecurity ? (
              <div className="mt-3 space-y-3">
                <div className="field-wrap">
                  <label htmlFor="setup-webauthn-rp-name">WebAuthn RP Name</label>
                  <input
                    className="field"
                    id="setup-webauthn-rp-name"
                    value={webauthnRpName}
                    onChange={(event) => setWebauthnRpName(event.target.value)}
                    placeholder="Aviary"
                  />
                </div>

                <div className="field-wrap">
                  <label htmlFor="setup-webauthn-origin">WebAuthn Origin</label>
                  <input
                    className="field"
                    id="setup-webauthn-origin"
                    value={webauthnOrigin}
                    onChange={(event) => setWebauthnOrigin(event.target.value)}
                    placeholder="https://aviary.example.com"
                  />
                </div>

                <div className="field-wrap">
                  <label htmlFor="setup-webauthn-rp-id">WebAuthn RP ID</label>
                  <input
                    className="field"
                    id="setup-webauthn-rp-id"
                    value={webauthnRpId}
                    onChange={(event) => setWebauthnRpId(event.target.value)}
                    placeholder="aviary.example.com"
                  />
                </div>

                <div className="field-wrap">
                  <label htmlFor="setup-totp-issuer">TOTP Issuer</label>
                  <input
                    className="field"
                    id="setup-totp-issuer"
                    value={totpIssuer}
                    onChange={(event) => setTotpIssuer(event.target.value)}
                    placeholder="Aviary"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating Admin..." : "Create Admin"}
          </button>
        </form>

        {error ? <p className="error mt-4">{error}</p> : null}
      </article>
    </main>
  );
}
