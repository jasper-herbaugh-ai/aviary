"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { apiBase } from "../../components/api";
import { getAuthToken, storeToken } from "../../components/auth";

type BootstrapStatus = {
  localBootstrapEnabled: boolean;
  hasUsers: boolean;
  setupRequired: boolean;
  bootstrapAdminEmail: string;
  oidcConfigured?: boolean;
};

type WebAuthnAuthOptionsResponse = {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
};

type BootstrapPasswordLoginResponse =
  | { token: string }
  | {
      mfaRequired: "webauthn";
      challengeId: string;
      options: PublicKeyCredentialRequestOptionsJSON;
    };

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("change-me");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingPasskey, setLoadingPasskey] = useState(false);
  const [loadingOidc, setLoadingOidc] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [showTotpField, setShowTotpField] = useState(false);

  useEffect(() => {
    if (getAuthToken()) {
      router.replace("/dashboard");
      return;
    }

    async function loadStatus() {
      try {
        const response = await fetch(`${apiBase()}/api/v1/auth/bootstrap-status`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as BootstrapStatus;
        setStatus(body);
        setEmail(body.bootstrapAdminEmail || "admin@example.com");
      } finally {
        setCheckingStatus(false);
      }
    }

    void loadStatus();
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoadingPassword(true);

    try {
      const response = await fetch(`${apiBase()}/api/v1/auth/local/bootstrap-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {})
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? `Login failed: ${response.status}`;
        setError(message);
        if (message === "MFA code required" || message === "Invalid MFA code") {
          setShowTotpField(true);
        } else {
          setShowTotpField(false);
          setTotpCode("");
        }
        return;
      }

      const body = (await response.json()) as BootstrapPasswordLoginResponse;

      if ("mfaRequired" in body && body.mfaRequired === "webauthn") {
        if (!browserSupportsWebAuthn()) {
          setError("Passkey MFA is required for this account, but this browser does not support WebAuthn.");
          return;
        }

        const assertion = await startAuthentication({
          optionsJSON: body.options
        });

        const verifyResponse = await fetch(`${apiBase()}/api/v1/auth/local/bootstrap-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
            webauthn: {
              challengeId: body.challengeId,
              response: assertion
            }
          })
        });

        if (!verifyResponse.ok) {
          const verifyBody = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
          setError(verifyBody?.error ?? `Passkey verification failed: ${verifyResponse.status}`);
          return;
        }

        const verifyBody = (await verifyResponse.json()) as { token: string };
        storeToken(verifyBody.token);
        router.push("/dashboard");
        return;
      }

      if ("token" in body) {
        storeToken(body.token);
        router.push("/dashboard");
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoadingPassword(false);
    }
  }

  async function onPasswordlessPasskeyLogin() {
    if (status?.setupRequired) {
      setError("Initial setup is required before passkey login is available.");
      return;
    }
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support WebAuthn/passkeys.");
      return;
    }

    setError(null);
    setLoadingPasskey(true);

    try {
      const optionsResponse = await fetch(`${apiBase()}/api/v1/auth/webauthn/authenticate/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined
        })
      });

      if (!optionsResponse.ok) {
        const body = (await optionsResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Passkey login failed: ${optionsResponse.status}`);
        return;
      }

      const optionsBody = (await optionsResponse.json()) as WebAuthnAuthOptionsResponse;
      const assertion = await startAuthentication({
        optionsJSON: optionsBody.options
      });

      const verifyResponse = await fetch(`${apiBase()}/api/v1/auth/webauthn/authenticate/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: optionsBody.challengeId,
          response: assertion
        })
      });

      if (!verifyResponse.ok) {
        const body = (await verifyResponse.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Passkey login verification failed: ${verifyResponse.status}`);
        return;
      }

      const body = (await verifyResponse.json()) as { token: string };
      storeToken(body.token);
      router.push("/dashboard");
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Passkey login failed");
    } finally {
      setLoadingPasskey(false);
    }
  }

  async function onOidcLogin() {
    setError(null);
    setLoadingOidc(true);

    try {
      const response = await fetch(`${apiBase()}/api/v1/auth/oidc/login`, {
        method: "POST"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `SSO login failed: ${response.status}`);
        return;
      }

      const body = (await response.json()) as { url: string };
      window.location.assign(body.url);
    } catch (oidcError) {
      setError(oidcError instanceof Error ? oidcError.message : "SSO login failed");
    } finally {
      setLoadingOidc(false);
    }
  }

  if (checkingStatus) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <article className="panel w-full p-6 text-sm text-slate-600">Checking bootstrap status...</article>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <article className="panel w-full p-6">
        <h1 className="m-0 text-2xl font-bold">Sign In</h1>
        <p className="mb-5 mt-2 text-sm text-slate-600">Use local credentials, enrolled passkeys, and optional SSO.</p>

        {status?.setupRequired ? (
          <p className="notice mb-4">
            First-time setup is required. Go to <Link className="text-blue-700 underline" href="/setup">/setup</Link> to create
            the bootstrap admin.
          </p>
        ) : null}

        <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <div className="field-wrap">
            <label htmlFor="sign-in-email">Email</label>
            <input
              className="field"
              id="sign-in-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="sign-in-password">Password</label>
            <input
              className="field"
              id="sign-in-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          {showTotpField ? (
            <div className="field-wrap">
              <label htmlFor="sign-in-totp">MFA Code</label>
              <input
                className="field"
                id="sign-in-totp"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                placeholder="123456"
              />
            </div>
          ) : null}

          <button className="btn btn-primary mx-auto block w-fit" type="submit" disabled={loadingPassword || loadingPasskey || loadingOidc}>
            {loadingPassword ? "Signing In..." : "Login With Password"}
          </button>
        </form>

        <div className="my-4 border-t border-slate-200" />

        <div className="space-y-2">
          {status?.oidcConfigured ? (
            <button
              className="btn btn-secondary w-full"
              type="button"
              onClick={() => void onOidcLogin()}
              disabled={loadingPasskey || loadingPassword || loadingOidc || Boolean(status?.setupRequired)}
            >
              {loadingOidc ? "Redirecting To SSO..." : "Sign In With SSO"}
            </button>
          ) : null}

          <button
            className="btn btn-secondary w-full"
            type="button"
            onClick={() => void onPasswordlessPasskeyLogin()}
            disabled={loadingPasskey || loadingPassword || loadingOidc || Boolean(status?.setupRequired)}
          >
            {loadingPasskey ? "Waiting For Passkey..." : "Sign In With Passkey (Passwordless)"}
          </button>
        </div>

        {error ? <p className="error mt-4">{error}</p> : null}
      </article>
    </main>
  );
}
