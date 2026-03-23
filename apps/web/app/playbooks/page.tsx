"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type PlaybookStep = {
  order: number;
  command: string;
  expectedExitCode: number;
  parseRule?: Record<string, unknown> | null;
};

type Playbook = {
  id: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  useSudo: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  steps: PlaybookStep[];
};

type StepInput = {
  key: string;
  command: string;
  expectedExitCode: number;
};

type PlaybookFormState = {
  name: string;
  description: string;
  useSudo: boolean;
  steps: StepInput[];
};

const initialForm: PlaybookFormState = {
  name: "",
  description: "",
  useSudo: false,
  steps: [{ key: "new-step-0", command: "", expectedExitCode: 0 }]
};

function nextStepKey(): string {
  return `step-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function normalizeSteps(steps: StepInput[]): Array<{ order: number; command: string; expectedExitCode: number }> {
  return steps
    .map((step) => ({
      command: step.command.trim(),
      expectedExitCode: Number(step.expectedExitCode)
    }))
    .filter((step) => step.command.length > 0)
    .map((step, index) => ({
      order: index + 1,
      command: step.command,
      expectedExitCode: Number.isFinite(step.expectedExitCode) ? step.expectedExitCode : 0
    }));
}

export default function PlaybooksPage() {
  const [rows, setRows] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlaybookFormState>(initialForm);
  const [error, setError] = useState<string | null>(null);

  const builtinCount = useMemo(() => rows.filter((row) => row.isBuiltin).length, [rows]);

  async function loadPlaybooks() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<Playbook[]>("/api/v1/playbooks");
      const sorted = [...response].sort((a, b) => {
        if (a.isBuiltin !== b.isBuiltin) {
          return a.isBuiltin ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      setRows(sorted);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load playbooks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlaybooks();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setError(null);
  }

  function openEdit(row: Playbook) {
    if (row.isBuiltin) {
      setError("Built-in playbooks are shown as read-only to preserve parser behavior.");
      return;
    }

    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      useSudo: row.useSudo,
      steps:
        row.steps.length > 0
          ? row.steps.map((step, index) => ({
              key: `${row.id}-${index}`,
              command: step.command,
              expectedExitCode: step.expectedExitCode
            }))
          : [{ key: nextStepKey(), command: "", expectedExitCode: 0 }]
    });
    setShowForm(true);
    setError(null);
  }

  function addStep() {
    setForm((current) => ({
      ...current,
      steps: [...current.steps, { key: nextStepKey(), command: "", expectedExitCode: 0 }]
    }));
  }

  function removeStep(key: string) {
    setForm((current) => {
      const remaining = current.steps.filter((step) => step.key !== key);
      return {
        ...current,
        steps: remaining.length > 0 ? remaining : [{ key: nextStepKey(), command: "", expectedExitCode: 0 }]
      };
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Playbook name is required.");
      return;
    }

    const normalizedSteps = normalizeSteps(form.steps);
    if (normalizedSteps.length === 0) {
      setError("At least one command step is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await apiFetch(`/api/v1/playbooks/${editingId}`, {
          method: "PATCH",
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            useSudo: form.useSudo,
            steps: normalizedSteps
          }
        });
      } else {
        await apiFetch("/api/v1/playbooks", {
          method: "POST",
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            isBuiltin: false,
            useSudo: form.useSudo,
            createdBy: "web-ui",
            steps: normalizedSteps
          }
        });
      }

      setEditingId(null);
      setForm(initialForm);
      setShowForm(false);
      await loadPlaybooks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save playbook");
    } finally {
      setSaving(false);
    }
  }

  async function removePlaybook(row: Playbook) {
    if (row.isBuiltin) {
      setError("Built-in playbooks cannot be deleted from this UI.");
      return;
    }

    const confirmed = window.confirm(`Delete playbook \"${row.name}\"?`);
    if (!confirmed) return;

    setError(null);
    try {
      await apiFetch(`/api/v1/playbooks/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) {
        setEditingId(null);
        setShowForm(false);
        setForm(initialForm);
      }
      await loadPlaybooks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete playbook");
    }
  }

  return (
    <Shell
      title="Playbooks"
      subtitle="Build reusable command sequences for one-click and scheduled execution."
      actions={
        <>
          <button className="btn btn-secondary" type="button" onClick={() => void loadPlaybooks()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            New Playbook
          </button>
        </>
      }
    >
      <p className="notice">Built-in playbooks are visible and executable, but edited/deleted controls are restricted to custom playbooks.</p>

      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Total Playbooks</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Built-In</p>
          <p className="stat-value">{builtinCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Custom</p>
          <p className="stat-value">{rows.length - builtinCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Total Steps</p>
          <p className="stat-value">{rows.reduce((sum, row) => sum + row.steps.length, 0)}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="playbook-name">Name</label>
                <input
                  className="field"
                  id="playbook-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="playbook-description">Description</label>
                <input
                  className="field"
                  id="playbook-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional summary"
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6">
                <label htmlFor="playbook-sudo">Default Privilege</label>
                <select
                  className="select"
                  id="playbook-sudo"
                  value={form.useSudo ? "sudo" : "standard"}
                  onChange={(event) => setForm((current) => ({ ...current, useSudo: event.target.value === "sudo" }))}
                >
                  <option value="standard">Standard</option>
                  <option value="sudo">Use sudo -n by default</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="playbook-steps-label">Steps</label>
                <button className="btn btn-secondary" type="button" onClick={addStep}>
                  Add Step
                </button>
              </div>

              {form.steps.map((step, index) => (
                <div
                  className="playbook-step-row grid min-w-0 gap-2 p-3 md:grid-cols-[minmax(0,1fr)_140px_auto]"
                  key={step.key}
                >
                  <input
                    className="field"
                    value={step.command}
                    placeholder={`Step ${index + 1} command`}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        steps: current.steps.map((item) =>
                          item.key === step.key ? { ...item, command: event.target.value } : item
                        )
                      }))
                    }
                  />
                  <input
                    className="field"
                    type="number"
                    value={step.expectedExitCode}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setForm((current) => ({
                        ...current,
                        steps: current.steps.map((item) =>
                          item.key === step.key
                            ? { ...item, expectedExitCode: Number.isFinite(value) ? value : 0 }
                            : item
                        )
                      }));
                    }}
                    aria-label={`Expected exit code for step ${index + 1}`}
                  />
                  <button className="btn btn-danger" type="button" onClick={() => removeStep(step.key)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update Playbook" : "Create Playbook"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialForm);
                  setShowForm(false);
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
          <div className="panel min-w-0 p-4">
            <div className="empty">No playbooks available.</div>
          </div>
        ) : (
          rows.map((row) => (
            <article className="panel min-w-0 p-4" key={row.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="m-0 text-lg font-semibold">{row.name}</h2>
                  <p className="m-0 mt-1 break-words text-sm text-muted">{row.description || "No description"}</p>
                </div>
                <span className={row.isBuiltin ? "badge badge-yellow" : "badge badge-green"}>
                  {row.isBuiltin ? "built-in" : "custom"}
                </span>
              </div>

              <ol className="mb-3 mt-0 min-w-0 space-y-1 pl-5 text-sm">
                {row.steps.map((step) => (
                  <li key={`${row.id}-${step.order}`}>
                    <span className="break-all font-medium">{step.command}</span>
                    <span className="text-muted"> (exit {step.expectedExitCode})</span>
                  </li>
                ))}
              </ol>

              <p className="m-0 text-xs text-muted">Updated {formatDateTime(row.updatedAt)}</p>
              <p className="m-0 text-xs text-muted">Default privilege: {row.useSudo ? "sudo -n" : "standard"}</p>

              <div className="actions mt-3">
                <button className="btn btn-secondary" type="button" onClick={() => openEdit(row)} disabled={row.isBuiltin}>
                  Edit
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void removePlaybook(row)} disabled={row.isBuiltin}>
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
