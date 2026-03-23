"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { formatCompactDate, formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type AlertMetric = "disk_percent" | "memory_percent" | "custom";
type AlertOperator = "gt" | "lt" | "eq";
type AlertSeverity = "info" | "warning" | "critical";

type Notification = {
  id: string;
  message: string;
  acknowledged: boolean;
  triggeredAt: string;
  acknowledgedAt: string | null;
};

type Alert = {
  id: string;
  serverId: string;
  metric: AlertMetric;
  threshold: number;
  operator: AlertOperator;
  severity: AlertSeverity;
  notificationChannel: string | null;
  lastTriggeredAt: string | null;
  server: { displayName: string };
  notifications: Notification[];
};

type ServerOption = {
  id: string;
  displayName: string;
};

type AlertFormState = {
  serverId: string;
  metric: AlertMetric;
  threshold: number;
  operator: AlertOperator;
  severity: AlertSeverity;
  notificationChannel: string;
};

const initialForm: AlertFormState = {
  serverId: "",
  metric: "disk_percent",
  threshold: 85,
  operator: "gt",
  severity: "warning",
  notificationChannel: ""
};

function severityBadge(value: AlertSeverity): string {
  if (value === "critical") return "badge badge-red";
  if (value === "warning") return "badge badge-yellow";
  return "badge badge-green";
}

export default function AlertsPage() {
  const [rows, setRows] = useState<Alert[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AlertFormState>(initialForm);
  const [error, setError] = useState<string | null>(null);

  const unresolvedCount = useMemo(() => {
    return rows.reduce((count, row) => {
      return count + row.notifications.filter((notification) => !notification.acknowledged).length;
    }, 0);
  }, [rows]);

  async function loadPageData() {
    setLoading(true);
    setError(null);

    try {
      const [alertRows, serverRows] = await Promise.all([
        apiFetch<Alert[]>("/api/v1/alerts"),
        apiFetch<ServerOption[]>("/api/v1/servers")
      ]);

      const sortedAlerts = [...alertRows].sort((a, b) => {
        const aTime = a.lastTriggeredAt ? new Date(a.lastTriggeredAt).getTime() : 0;
        const bTime = b.lastTriggeredAt ? new Date(b.lastTriggeredAt).getTime() : 0;
        return bTime - aTime;
      });

      setRows(sortedAlerts);
      setServers(serverRows);

      if (!editingId && !form.serverId && serverRows[0]) {
        setForm((current) => ({ ...current, serverId: serverRows[0]?.id ?? "" }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...initialForm,
      serverId: servers[0]?.id ?? ""
    });
    setShowForm(true);
    setError(null);
  }

  function openEdit(row: Alert) {
    setEditingId(row.id);
    setForm({
      serverId: row.serverId,
      metric: row.metric,
      threshold: row.threshold,
      operator: row.operator,
      severity: row.severity,
      notificationChannel: row.notificationChannel ?? ""
    });
    setShowForm(true);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.serverId) {
      setError("Server is required.");
      return;
    }

    if (!Number.isFinite(form.threshold)) {
      setError("Threshold must be a valid number.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      serverId: form.serverId,
      metric: form.metric,
      threshold: Number(form.threshold),
      operator: form.operator,
      severity: form.severity,
      notificationChannel: form.notificationChannel.trim() || undefined
    };

    try {
      if (editingId) {
        await apiFetch(`/api/v1/alerts/${editingId}`, {
          method: "PATCH",
          body: {
            metric: payload.metric,
            threshold: payload.threshold,
            operator: payload.operator,
            severity: payload.severity,
            notificationChannel: payload.notificationChannel ?? null
          }
        });
      } else {
        await apiFetch("/api/v1/alerts", { method: "POST", body: payload });
      }

      setEditingId(null);
      setShowForm(false);
      setForm(initialForm);
      await loadPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save alert");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlert(id: string) {
    const confirmed = window.confirm("Delete this alert rule?");
    if (!confirmed) return;

    setError(null);
    try {
      await apiFetch(`/api/v1/alerts/${id}`, { method: "DELETE" });
      if (editingId === id) {
        setEditingId(null);
        setShowForm(false);
        setForm(initialForm);
      }
      await loadPageData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete alert");
    }
  }

  async function acknowledge(alertId: string, notificationId: string) {
    setError(null);
    try {
      await apiFetch(`/api/v1/alerts/${alertId}/acknowledge`, {
        method: "POST",
        body: { notificationId }
      });
      await loadPageData();
    } catch (ackError) {
      setError(ackError instanceof Error ? ackError.message : "Unable to acknowledge notification");
    }
  }

  return (
    <Shell
      title="Alerts"
      subtitle="Set thresholds, monitor trigger events, and acknowledge notifications."
      actions={
        <>
          <a className="btn btn-secondary" href="/automation/settings/alerts-backend">
            Alerts Backend
          </a>
          <button className="btn btn-secondary" type="button" onClick={() => void loadPageData()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            New Alert
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Alert Rules</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Critical Rules</p>
          <p className="stat-value">{rows.filter((row) => row.severity === "critical").length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Unresolved Notifications</p>
          <p className="stat-value">{unresolvedCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Protected Servers</p>
          <p className="stat-value">{new Set(rows.map((row) => row.serverId)).size}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-server">Server</label>
                <select
                  className="select"
                  id="alert-server"
                  value={form.serverId}
                  onChange={(event) => setForm((current) => ({ ...current, serverId: event.target.value }))}
                >
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-metric">Metric</label>
                <select
                  className="select"
                  id="alert-metric"
                  value={form.metric}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      metric: event.target.value as AlertMetric
                    }))
                  }
                >
                  <option value="disk_percent">disk_percent</option>
                  <option value="memory_percent">memory_percent</option>
                  <option value="custom">custom</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-threshold">Threshold</label>
                <input
                  className="field"
                  id="alert-threshold"
                  type="number"
                  step="0.01"
                  value={form.threshold}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setForm((current) => ({ ...current, threshold: Number.isFinite(value) ? value : current.threshold }));
                  }}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-operator">Operator</label>
                <select
                  className="select"
                  id="alert-operator"
                  value={form.operator}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      operator: event.target.value as AlertOperator
                    }))
                  }
                >
                  <option value="gt">Greater than</option>
                  <option value="lt">Less than</option>
                  <option value="eq">Equal to</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-severity">Severity</label>
                <select
                  className="select"
                  id="alert-severity"
                  value={form.severity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      severity: event.target.value as AlertSeverity
                    }))
                  }
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="alert-channel">Notification Channel</label>
                <input
                  className="field"
                  id="alert-channel"
                  value={form.notificationChannel}
                  onChange={(event) => setForm((current) => ({ ...current, notificationChannel: event.target.value }))}
                  placeholder="email://ops@example.com"
                />
              </div>
            </div>

            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update Alert" : "Create Alert"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setShowForm(false);
                  setForm(initialForm);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </article>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {rows.length === 0 ? (
          <article className="panel p-4">
            <div className="empty">No alert rules configured.</div>
          </article>
        ) : (
          rows.map((row) => (
            <article className="panel min-w-0 p-4" key={row.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="m-0 text-base font-semibold">
                    {row.server.displayName} {row.metric} {row.operator} {row.threshold}
                  </h2>
                  <p className="m-0 mt-1 text-xs text-muted">Last triggered {formatDateTime(row.lastTriggeredAt)}</p>
                </div>
                <span className={severityBadge(row.severity)}>{row.severity}</span>
              </div>

              <div className="alert-channel-box">
                <p className="m-0">
                  Channel: <span className="font-medium">{row.notificationChannel ?? "none"}</span>
                </p>
              </div>

              <div className="space-y-2">
                <p className="section-label">Notifications</p>
                {row.notifications.length === 0 ? (
                  <div className="empty">No notifications yet.</div>
                ) : (
                  row.notifications.slice(0, 5).map((notification) => (
                    <div className="alert-notification-card" key={notification.id}>
                      <p className="m-0 text-sm">{notification.message}</p>
                      <p className="m-0 mt-1 text-xs text-muted">{formatCompactDate(notification.triggeredAt)}</p>
                      <div className="actions mt-2">
                        <span className={notification.acknowledged ? "badge badge-green" : "badge badge-yellow"}>
                          {notification.acknowledged ? "acknowledged" : "open"}
                        </span>
                        {!notification.acknowledged ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => void acknowledge(row.id, notification.id)}
                          >
                            Acknowledge
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="actions mt-3">
                <button className="btn btn-secondary" type="button" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void removeAlert(row.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </Shell>
  );
}
