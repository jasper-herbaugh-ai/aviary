"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { countWithLabel, formatCompactDate, formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type HealthCard = {
  serverId: string;
  displayName: string;
  lastJobStatus: string | null;
  diskPercent: number | null;
  memoryPercent: number | null;
  lastRunAt: string | null;
};

type JobRow = {
  id: string;
  status: string;
  enqueuedAt: string;
  server: { displayName: string };
  playbook: { name: string };
};

type Notification = {
  id: string;
  message: string;
  acknowledged: boolean;
  triggeredAt: string;
};

type AlertRow = {
  id: string;
  server: { displayName: string };
  metric: string;
  operator: string;
  threshold: number;
  notifications: Notification[];
};

type ServerRow = {
  id: string;
  active: boolean;
};

function jobStatusClass(status: string | null) {
  if (status === "success") return "badge badge-green";
  if (status === "failed" || status === "timeout") return "badge badge-red";
  return "badge badge-yellow";
}

function healthMetricClass(value: number | null) {
  if (value === null) return "health-pill health-pill-unknown";
  if (value >= 90) return "health-pill health-pill-critical";
  if (value >= 75) return "health-pill health-pill-warn";
  return "health-pill health-pill-ok";
}

export default function DashboardPage() {
  const [healthCards, setHealthCards] = useState<HealthCard[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unresolvedCount = useMemo(() => {
    return alerts.reduce((count, alert) => {
      return count + alert.notifications.filter((notification) => !notification.acknowledged).length;
    }, 0);
  }, [alerts]);

  const atRiskCount = useMemo(() => {
    return healthCards.filter((card) => {
      const diskRisk = card.diskPercent !== null && card.diskPercent >= 85;
      const memoryRisk = card.memoryPercent !== null && card.memoryPercent >= 90;
      return diskRisk || memoryRisk;
    }).length;
  }, [healthCards]);

  const queuedJobs = useMemo(() => jobs.filter((job) => job.status === "queued").length, [jobs]);

  const runningJobs = useMemo(() => jobs.filter((job) => job.status === "running").length, [jobs]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [health, recentJobs, alertRows, serverRows] = await Promise.all([
        apiFetch<HealthCard[]>("/api/v1/dashboard/health"),
        apiFetch<JobRow[]>("/api/v1/jobs?limit=8"),
        apiFetch<AlertRow[]>("/api/v1/alerts?unresolved=true"),
        apiFetch<ServerRow[]>("/api/v1/servers")
      ]);

      setHealthCards(health);
      setJobs(recentJobs);
      setAlerts(alertRows);
      setServers(serverRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  return (
    <Shell
      title="Dashboard"
      subtitle="Live status across inventory, jobs, and alerting."
      actions={
        <button className="btn btn-secondary" onClick={() => void loadDashboard()} type="button" disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Active Servers</p>
          <p className="stat-value">{servers.filter((server) => server.active).length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Unresolved Notifications</p>
          <p className="stat-value">{unresolvedCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Jobs In Queue</p>
          <p className="stat-value">{queuedJobs}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">At-Risk Servers</p>
          <p className="stat-value">{atRiskCount}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        <article className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Recent Jobs</th>
                <th>Status</th>
                <th>Server</th>
                <th>Queued</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty">No jobs yet. Trigger one from Jobs.</div>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link className="table-link" href={`/jobs/${job.id}`}>
                        {job.playbook.name}
                      </Link>
                    </td>
                    <td>
                      <span className={jobStatusClass(job.status)}>
                        {job.status}
                      </span>
                    </td>
                    <td>{job.server.displayName}</td>
                    <td>{formatCompactDate(job.enqueuedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>

        <article className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold">Server Health</h2>
            <p className="section-meta">{countWithLabel(healthCards.length, "server", "servers")}</p>
          </div>

          <div className="health-list">
            {healthCards.length === 0 ? (
              <div className="empty">No telemetry yet. Run health playbooks to populate metrics.</div>
            ) : (
              healthCards.map((card) => (
                <article className="health-card" key={card.serverId}>
                  <div className="health-card-head">
                    <h3 className="health-card-title">{card.displayName}</h3>
                    <span className={jobStatusClass(card.lastJobStatus)}>
                      {card.lastJobStatus ?? "unknown"}
                    </span>
                  </div>
                  <div className="health-card-metrics">
                    <span className={healthMetricClass(card.diskPercent)}>Disk {card.diskPercent ?? "n/a"}%</span>
                    <span className={healthMetricClass(card.memoryPercent)}>Memory {card.memoryPercent ?? "n/a"}%</span>
                    <span className="health-last-run">Last run {formatDateTime(card.lastRunAt)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Unresolved Alert Activity</h2>
          <p className="section-meta">
            {countWithLabel(unresolvedCount, "notification", "notifications")}, {runningJobs} running jobs
          </p>
        </div>

        {alerts.length === 0 ? (
          <div className="empty">No unresolved alerts.</div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 6).map((alert) => {
              const latest = alert.notifications[0];
              return (
                <div className="alert-activity-row" key={alert.id}>
                  <p className="m-0 font-semibold">
                    {alert.server.displayName} {alert.metric} {alert.operator} {alert.threshold}
                  </p>
                  <p className="alert-activity-detail">{latest ? latest.message : "No notification details"}</p>
                  <p className="alert-activity-meta">Latest: {formatCompactDate(latest?.triggeredAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </Shell>
  );
}
