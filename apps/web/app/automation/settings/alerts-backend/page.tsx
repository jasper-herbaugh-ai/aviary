"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../../components/api";
import { Shell } from "../../../../components/shell";

type AlertsBackendType = "database" | "webhook";

type AlertsBackendResponse = {
  stored: {
    type: AlertsBackendType;
    webhookUrl: string | null;
    authHeaderConfigured: boolean;
  };
  effective: {
    type: AlertsBackendType;
    webhookUrl: string | null;
  };
};

export default function AlertsBackendSettingsPage() {
  const [settings, setSettings] = useState<AlertsBackendResponse | null>(null);
  const [type, setType] = useState<AlertsBackendType>("database");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [clearAuthHeader, setClearAuthHeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<AlertsBackendResponse>("/api/v1/settings/alerts-backend");
      setSettings(response);
      setType(response.stored.type);
      setWebhookUrl(response.stored.webhookUrl ?? "");
      setAuthHeader("");
      setClearAuthHeader(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load alerts backend settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();

    if (type === "webhook" && !webhookUrl.trim()) {
      setError("Webhook URL is required when webhook backend is selected.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch<AlertsBackendResponse>("/api/v1/settings/alerts-backend", {
        method: "PUT",
        body: {
          type,
          webhookUrl: webhookUrl.trim() || null,
          ...(authHeader.trim() ? { authHeader: authHeader.trim() } : {}),
          ...(clearAuthHeader ? { authHeader: null } : {})
        }
      });

      setMessage("Alerts backend settings saved.");
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save alerts backend settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell
      title="Alerts Backend"
      subtitle="Configure how triggered alerts are delivered beyond the built-in database notifications."
      actions={
        <button className="btn btn-secondary" type="button" onClick={() => void loadSettings()} disabled={loading || saving}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Backend Type</p>
          <p className="stat-value">{settings?.effective.type ?? "n/a"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Webhook URL</p>
          <p className="stat-value">{settings?.effective.webhookUrl ? "Configured" : "Not Set"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Auth Header</p>
          <p className="stat-value">{settings?.stored.authHeaderConfigured ? "Configured" : "Not Set"}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Default Storage</p>
          <p className="stat-value">Enabled</p>
        </article>
      </section>

      <article className="panel p-4">
        <h2 className="m-0 text-lg font-semibold">Delivery Configuration</h2>
        <p className="mb-4 mt-2 text-sm text-slate-600">
          Alert notifications are always written to Aviary&apos;s database. Select an additional backend for outbound delivery.
        </p>

        <form className="space-y-3" onSubmit={(event) => void saveSettings(event)}>
          <div className="field-wrap">
            <label htmlFor="alerts-backend-type">Backend Type</label>
            <select
              className="select"
              id="alerts-backend-type"
              value={type}
              onChange={(event) => setType(event.target.value as AlertsBackendType)}
            >
              <option value="database">Database only</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div className="field-wrap">
            <label htmlFor="alerts-backend-webhook">Webhook URL</label>
            <input
              className="field"
              id="alerts-backend-webhook"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://alerts.example.com/hooks/aviary"
            />
          </div>

          <div className="field-wrap">
            <label htmlFor="alerts-backend-auth">Authorization Header Value (optional)</label>
            <input
              className="field"
              id="alerts-backend-auth"
              type="password"
              value={authHeader}
              onChange={(event) => {
                setAuthHeader(event.target.value);
                setClearAuthHeader(false);
              }}
              placeholder="Bearer <token>"
            />
            {settings?.stored.authHeaderConfigured ? (
              <p className="m-0 mt-1 text-xs text-slate-500">A header value is currently stored. Leave blank to keep it.</p>
            ) : null}
          </div>

          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={saving || loading}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={saving || loading || !settings?.stored.authHeaderConfigured}
              onClick={() => {
                setAuthHeader("");
                setClearAuthHeader(true);
                setMessage("Authorization header will be cleared on save.");
                setError(null);
              }}
            >
              Clear Authorization Header
            </button>
          </div>
        </form>
      </article>
    </Shell>
  );
}
