"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type TargetType = "server" | "tag" | "all";

type Schedule = {
  id: string;
  playbookId: string;
  targetType: TargetType;
  targetIds: string[];
  cronExpression: string;
  useSudo: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  playbook: { name: string };
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

type ScheduleFormState = {
  playbookId: string;
  targetType: TargetType;
  targetIds: string[];
  cronExpression: string;
  useSudo: boolean;
  enabled: boolean;
};

const initialForm: ScheduleFormState = {
  playbookId: "",
  targetType: "all",
  targetIds: [],
  cronExpression: "0 * * * *",
  useSudo: false,
  enabled: true
};

function selectedValues(event: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

export default function SchedulesPage() {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNowId, setRunningNowId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(initialForm);
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
      const [scheduleRows, playbookRows, serverRows] = await Promise.all([
        apiFetch<Schedule[]>("/api/v1/schedules"),
        apiFetch<PlaybookOption[]>("/api/v1/playbooks"),
        apiFetch<ServerOption[]>("/api/v1/servers")
      ]);
      setRows(scheduleRows);
      setPlaybooks(playbookRows);
      setServers(serverRows);

      if (!editingId && !form.playbookId && playbookRows[0]) {
        setForm((current) => ({
          ...current,
          playbookId: playbookRows[0]?.id ?? "",
          useSudo: playbookRows[0]?.useSudo ?? false
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  function openCreate() {
    const defaultPlaybook = playbooks[0];
    setEditingId(null);
    setForm({
      ...initialForm,
      playbookId: defaultPlaybook?.id ?? "",
      useSudo: defaultPlaybook?.useSudo ?? false
    });
    setShowForm(true);
    setError(null);
  }

  function openEdit(row: Schedule) {
    setEditingId(row.id);
    setForm({
      playbookId: row.playbookId,
      targetType: row.targetType,
      targetIds: row.targetIds,
      cronExpression: row.cronExpression,
      useSudo: row.useSudo,
      enabled: row.enabled
    });
    setShowForm(true);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.playbookId) {
      setError("Playbook selection is required.");
      return;
    }

    if (!form.cronExpression.trim()) {
      setError("Cron expression is required.");
      return;
    }

    if (form.targetType !== "all" && form.targetIds.length === 0) {
      setError("Choose at least one target for server or tag based schedules.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      playbookId: form.playbookId,
      targetType: form.targetType,
      targetIds: form.targetType === "all" ? [] : form.targetIds,
      cronExpression: form.cronExpression.trim(),
      useSudo: form.useSudo,
      enabled: form.enabled
    };

    try {
      if (editingId) {
        await apiFetch(`/api/v1/schedules/${editingId}`, { method: "PATCH", body: payload });
      } else {
        await apiFetch("/api/v1/schedules", { method: "POST", body: payload });
      }

      setEditingId(null);
      setShowForm(false);
      setForm(initialForm);
      await loadPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: string) {
    const confirmed = window.confirm("Delete this schedule?");
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/schedules/${id}`, { method: "DELETE" });
      if (editingId === id) {
        setEditingId(null);
        setShowForm(false);
        setForm(initialForm);
      }
      await loadPageData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete schedule");
    }
  }

  async function toggleEnabled(row: Schedule) {
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/schedules/${row.id}`, {
        method: "PATCH",
        body: { enabled: !row.enabled }
      });
      await loadPageData();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update schedule");
    }
  }

  async function runNow(row: Schedule) {
    setRunningNowId(row.id);
    setError(null);
    setMessage(null);

    try {
      const result = await apiFetch<{ count: number }>("/api/v1/jobs/run-now", {
        method: "POST",
        body: {
          playbookId: row.playbookId,
          targetType: row.targetType,
          targetIds: row.targetType === "all" ? [] : row.targetIds,
          useSudo: row.useSudo
        }
      });
      setMessage(`Queued ${result.count} job${result.count === 1 ? "" : "s"} for schedule ${row.id.slice(0, 8)}.`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run schedule now");
    } finally {
      setRunningNowId(null);
    }
  }

  return (
    <Shell
      title="Schedules"
      subtitle="Automate recurring runs by playbook, target scope, and cron expression."
      actions={
        <>
          <button className="btn btn-secondary" type="button" onClick={() => void loadPageData()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            New Schedule
          </button>
        </>
      }
    >
      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Total Schedules</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Enabled</p>
          <p className="stat-value">{rows.filter((row) => row.enabled).length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Targeting Tags</p>
          <p className="stat-value">{rows.filter((row) => row.targetType === "tag").length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Playbooks Available</p>
          <p className="stat-value">{playbooks.length}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="schedule-playbook">Playbook</label>
                <select
                  className="select"
                  id="schedule-playbook"
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

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="schedule-target-type">Target Type</label>
                <select
                  className="select"
                  id="schedule-target-type"
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

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="schedule-sudo">Privilege</label>
                <select
                  className="select"
                  id="schedule-sudo"
                  value={form.useSudo ? "sudo" : "standard"}
                  onChange={(event) => setForm((current) => ({ ...current, useSudo: event.target.value === "sudo" }))}
                >
                  <option value="standard">Standard</option>
                  <option value="sudo">Use sudo -n</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="schedule-enabled">State</label>
                <select
                  className="select"
                  id="schedule-enabled"
                  value={form.enabled ? "enabled" : "disabled"}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.value === "enabled" }))}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="field-wrap col-span-12">
                <label htmlFor="schedule-cron">Cron Expression</label>
                <input
                  className="field"
                  id="schedule-cron"
                  value={form.cronExpression}
                  onChange={(event) => setForm((current) => ({ ...current, cronExpression: event.target.value }))}
                  placeholder="0 * * * *"
                />
              </div>

              {form.targetType === "server" ? (
                <div className="field-wrap col-span-12">
                  <label htmlFor="schedule-targets-server">Target Servers (multi-select)</label>
                  <select
                    className="select"
                    id="schedule-targets-server"
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
                  <label htmlFor="schedule-targets-tag">Target Tags (multi-select)</label>
                  <select
                    className="select"
                    id="schedule-targets-tag"
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
                {saving ? "Saving..." : editingId ? "Update Schedule" : "Create Schedule"}
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

      <article className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Playbook</th>
              <th>Target</th>
              <th>Cron</th>
              <th>State</th>
              <th>Next Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No schedules configured.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <p className="m-0 font-semibold">{row.playbook.name}</p>
                    <p className="m-0 text-xs text-slate-500">{row.playbookId.slice(0, 8)}</p>
                  </td>
                  <td>
                    <p className="m-0">
                      {row.targetType === "all" ? "All servers" : row.targetType === "server" ? "Servers" : "Tags"}
                    </p>
                    <p className="m-0 text-xs text-slate-500">
                      {row.targetIds.length > 0 ? row.targetIds.join(", ") : "n/a"}
                    </p>
                  </td>
                  <td>{row.cronExpression}</td>
                  <td>
                    <span className={row.enabled ? "badge badge-green" : "badge badge-red"}>
                      {row.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <p className="m-0">{formatDateTime(row.nextRunAt)}</p>
                    <p className="m-0 text-xs text-slate-500">
                      Last: {formatDateTime(row.lastRunAt)} | {row.useSudo ? "sudo" : "standard"}
                    </p>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => void runNow(row)}
                        disabled={runningNowId === row.id}
                      >
                        {runningNowId === row.id ? "Queueing..." : "Run Now"}
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => void toggleEnabled(row)}>
                        {row.enabled ? "Disable" : "Enable"}
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => void removeSchedule(row.id)}>
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
