"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { formatCompactDate, formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type JobStatus = "queued" | "running" | "success" | "failed" | "timeout";
type TargetType = "server" | "tag" | "all";

type Job = {
  id: string;
  status: JobStatus;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  serverId: string;
  playbookId: string;
  useSudo: boolean;
  server: { displayName: string };
  playbook: { name: string };
  schedule: { id: string } | null;
};

type PlaybookOption = {
  id: string;
  name: string;
  useSudo: boolean;
};

type ServerOption = {
  id: string;
  displayName: string;
  tags: string[];
};

type RunNowFormState = {
  playbookId: string;
  targetType: TargetType;
  targetIds: string[];
  useSudo: boolean;
};

const initialRunNowForm: RunNowFormState = {
  playbookId: "",
  targetType: "all",
  targetIds: [],
  useSudo: false
};

function runNowFormWithDefault(playbookId: string, useSudo = false): RunNowFormState {
  return {
    playbookId,
    targetType: "all",
    targetIds: [],
    useSudo
  };
}

function selectedValues(event: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

function statusBadge(status: JobStatus): string {
  if (status === "success") return "badge badge-green";
  if (status === "failed" || status === "timeout") return "badge badge-red";
  return "badge badge-yellow";
}

export default function JobsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RunNowFormState>(initialRunNowForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const server of servers) {
      for (const tag of server.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [servers]);

  async function loadPageData() {
    setLoading(true);
    setError(null);

    try {
      const [jobRows, playbookRows, serverRows] = await Promise.all([
        apiFetch<Job[]>("/api/v1/jobs?limit=100"),
        apiFetch<PlaybookOption[]>("/api/v1/playbooks"),
        apiFetch<ServerOption[]>("/api/v1/servers")
      ]);

      setRows(jobRows);
      setPlaybooks(playbookRows);
      setServers(serverRows);

      if (!form.playbookId && playbookRows[0]) {
        setForm((current) => ({
          ...current,
          playbookId: playbookRows[0]?.id ?? "",
          useSudo: playbookRows[0]?.useSudo ?? false
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  async function runNow(event: FormEvent) {
    event.preventDefault();

    if (!form.playbookId) {
      setError("Playbook is required.");
      return;
    }

    if (form.targetType !== "all" && form.targetIds.length === 0) {
      setError("Select at least one target for server/tag runs.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result = await apiFetch<{ count: number }>("/api/v1/jobs/run-now", {
        method: "POST",
        body: {
          playbookId: form.playbookId,
          targetType: form.targetType,
          targetIds: form.targetType === "all" ? [] : form.targetIds,
          useSudo: form.useSudo
        }
      });

      setMessage(`Queued ${result.count} job${result.count === 1 ? "" : "s"}.`);
      setShowForm(false);
      setForm(runNowFormWithDefault(playbooks[0]?.id ?? "", playbooks[0]?.useSudo ?? false));
      await loadPageData();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to queue jobs");
    } finally {
      setSaving(false);
    }
  }

  async function removeJob(id: string) {
    const confirmed = window.confirm("Delete this job and all stored step results?");
    if (!confirmed) return;

    setError(null);
    setMessage(null);

    try {
      await apiFetch(`/api/v1/jobs/${id}`, { method: "DELETE" });
      setMessage(`Deleted job ${id.slice(0, 8)}.`);
      await loadPageData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete job");
    }
  }

  function canDeleteJob(status: JobStatus): boolean {
    return status !== "queued" && status !== "running";
  }

  return (
    <Shell
      title="Jobs"
      subtitle="Trigger immediate runs, inspect execution status, and clean up historical records."
      actions={
        <>
          <button className="btn btn-secondary" type="button" onClick={() => void loadPageData()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setShowForm((current) => {
                const next = !current;
                if (next) {
                  setForm((currentForm) => ({
                    ...currentForm,
                    playbookId: currentForm.playbookId || playbooks[0]?.id || "",
                    useSudo:
                      playbooks.find((playbook) => playbook.id === (currentForm.playbookId || playbooks[0]?.id))
                        ?.useSudo ?? false
                  }));
                }
                return next;
              });
              setError(null);
              setMessage(null);
            }}
          >
            {showForm ? "Close Runner" : "Run Playbook Now"}
          </button>
        </>
      }
    >
      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Recent Jobs</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Queued</p>
          <p className="stat-value">{rows.filter((row) => row.status === "queued").length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Running</p>
          <p className="stat-value">{rows.filter((row) => row.status === "running").length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Failures</p>
          <p className="stat-value">{rows.filter((row) => row.status === "failed" || row.status === "timeout").length}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void runNow(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="jobs-run-playbook">Playbook</label>
                <select
                  className="select"
                  id="jobs-run-playbook"
                  value={form.playbookId}
                  onChange={(event) => {
                    const playbookId = event.target.value;
                    const selected = playbooks.find((playbook) => playbook.id === playbookId);
                    setForm((current) => ({ ...current, playbookId, useSudo: selected?.useSudo ?? false }));
                  }}
                >
                  {playbooks.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="jobs-run-target-type">Target Type</label>
                <select
                  className="select"
                  id="jobs-run-target-type"
                  value={form.targetType}
                  onChange={(event) => {
                    const targetType = event.target.value as TargetType;
                    setForm((current) => ({
                      ...current,
                      targetType,
                      targetIds: targetType === "all" ? [] : current.targetIds
                    }));
                  }}
                >
                  <option value="all">All Servers</option>
                  <option value="server">Specific Servers</option>
                  <option value="tag">Tags</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="jobs-run-privilege">Privilege</label>
                <select
                  className="select"
                  id="jobs-run-privilege"
                  value={form.useSudo ? "sudo" : "standard"}
                  onChange={(event) => setForm((current) => ({ ...current, useSudo: event.target.value === "sudo" }))}
                >
                  <option value="standard">Standard</option>
                  <option value="sudo">Use sudo -n</option>
                </select>
              </div>

              {form.targetType === "server" ? (
                <div className="field-wrap col-span-12">
                  <label htmlFor="jobs-run-servers">Server Targets (multi-select)</label>
                  <select
                    className="select"
                    id="jobs-run-servers"
                    multiple
                    size={Math.min(Math.max(servers.length, 3), 8)}
                    value={form.targetIds}
                    onChange={(event) => setForm((current) => ({ ...current, targetIds: selectedValues(event) }))}
                  >
                    {servers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {form.targetType === "tag" ? (
                <div className="field-wrap col-span-12">
                  <label htmlFor="jobs-run-tags">Tag Targets (multi-select)</label>
                  <select
                    className="select"
                    id="jobs-run-tags"
                    multiple
                    size={Math.min(Math.max(tagOptions.length, 3), 8)}
                    value={form.targetIds}
                    onChange={(event) => setForm((current) => ({ ...current, targetIds: selectedValues(event) }))}
                  >
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Queueing..." : "Queue Run"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(runNowFormWithDefault(playbooks[0]?.id ?? "", playbooks[0]?.useSudo ?? false));
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </article>
      ) : null}

      <article className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Server</th>
              <th>Playbook</th>
              <th>Queued</th>
              <th>Timeline</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No jobs found.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="font-semibold text-blue-700 hover:underline" href={`/jobs/${row.id}`}>
                      {row.id.slice(0, 8)}
                    </Link>
                    <p className="m-0 mt-1 text-xs text-slate-500">{row.schedule ? `schedule ${row.schedule.id.slice(0, 8)}` : "manual run"}</p>
                  </td>
                  <td>
                    <span className={statusBadge(row.status)}>{row.status}</span>
                  </td>
                  <td>{row.server.displayName}</td>
                  <td>
                    <p className="m-0">{row.playbook.name}</p>
                    <p className="m-0 text-xs text-slate-500">{row.useSudo ? "sudo -n" : "standard"}</p>
                  </td>
                  <td>{formatCompactDate(row.enqueuedAt)}</td>
                  <td>
                    <p className="m-0 text-xs text-slate-600">Start {formatDateTime(row.startedAt)}</p>
                    <p className="m-0 text-xs text-slate-600">End {formatDateTime(row.completedAt)}</p>
                  </td>
                  <td>
                    <div className="actions">
                      <Link className="btn btn-secondary" href={`/jobs/${row.id}`}>
                        View
                      </Link>
                      <button
                        className="btn btn-danger"
                        type="button"
                        onClick={() => void removeJob(row.id)}
                        disabled={!canDeleteJob(row.status)}
                        title={!canDeleteJob(row.status) ? "Only completed jobs can be deleted." : undefined}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </Shell>
  );
}
