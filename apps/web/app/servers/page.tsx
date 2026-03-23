"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { countWithLabel, formatDateTime } from "../../components/format";
import { formatServerUsername, parseServerTags } from "../../components/servers";
import { Shell } from "../../components/shell";

type Server = {
  id: string;
  hostname: string;
  ipAddress: string;
  port: number;
  username: string | null;
  displayName: string;
  osType: string | null;
  tags: string[];
  active: boolean;
  credentialId: string | null;
  credentialName: string | null;
  createdAt: string;
  updatedAt: string;
};

type CredentialOption = {
  id: string;
  name: string;
  username: string;
};

type ServerFormState = {
  displayName: string;
  hostname: string;
  ipAddress: string;
  port: number;
  username: string;
  credentialId: string;
  osType: string;
  tags: string;
  active: boolean;
};

const initialForm: ServerFormState = {
  displayName: "",
  hostname: "",
  ipAddress: "",
  port: 22,
  username: "",
  credentialId: "",
  osType: "",
  tags: "",
  active: true
};

export default function ServersPage() {
  const [rows, setRows] = useState<Server[]>([]);
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(initialForm);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(() => rows.filter((row) => row.active).length, [rows]);

  const distinctTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const row of rows) {
      for (const tag of row.tags) {
        tagSet.add(tag);
      }
    }
    return tagSet.size;
  }, [rows]);

  async function loadServers() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<Server[]>("/api/v1/servers");
      setRows(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load servers");
    } finally {
      setLoading(false);
    }
  }

  async function loadCredentials() {
    try {
      const response = await apiFetch<CredentialOption[]>("/api/v1/credentials");
      setCredentials(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load credentials");
    }
  }

  useEffect(() => {
    void loadServers();
    void loadCredentials();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ ...initialForm, credentialId: credentials[0]?.id ?? "" });
    setShowForm(true);
    setError(null);
  }

  function openEdit(row: Server) {
    setEditingId(row.id);
    setForm({
      displayName: row.displayName,
      hostname: row.hostname,
      ipAddress: row.ipAddress,
      port: row.port,
      username: row.username ?? "",
      credentialId: row.credentialId ?? "",
      osType: row.osType ?? "",
      tags: row.tags.join(", "),
      active: row.active
    });
    setShowForm(true);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.displayName.trim() || !form.hostname.trim() || !form.ipAddress.trim()) {
      setError("Display name, hostname, and IP address are required.");
      return;
    }
    if (!form.credentialId) {
      setError("Credential is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      displayName: form.displayName.trim(),
      hostname: form.hostname.trim(),
      ipAddress: form.ipAddress.trim(),
      port: Number(form.port),
      username: form.username.trim() || null,
      credentialId: form.credentialId,
      osType: form.osType.trim() || null,
      tags: parseServerTags(form.tags),
      active: form.active
    };

    try {
      if (editingId) {
        await apiFetch(`/api/v1/servers/${editingId}`, { method: "PATCH", body: payload });
      } else {
        await apiFetch("/api/v1/servers", { method: "POST", body: payload });
      }

      setShowForm(false);
      setForm(initialForm);
      setEditingId(null);
      await loadServers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save server");
    } finally {
      setSaving(false);
    }
  }

  async function removeServer(id: string) {
    const confirmed = window.confirm("Delete this server? Existing jobs and alerts tied to it may also be removed.");
    if (!confirmed) return;

    setError(null);
    try {
      await apiFetch(`/api/v1/servers/${id}`, { method: "DELETE" });
      if (editingId === id) {
        setShowForm(false);
        setEditingId(null);
        setForm(initialForm);
      }
      await loadServers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete server");
    }
  }

  return (
    <Shell
      title="Servers"
      subtitle="Manage host inventory, connectivity metadata, and targeting tags."
      actions={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              void loadServers();
              void loadCredentials();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate} disabled={credentials.length === 0}>
            New Server
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}
      {credentials.length === 0 ? <p className="text-sm text-slate-500">Create a credential before adding a server.</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Total Servers</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Active</p>
          <p className="stat-value">{activeCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Inactive</p>
          <p className="stat-value">{rows.length - activeCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Tags In Use</p>
          <p className="stat-value">{distinctTags}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 lg:col-span-6">
                <label htmlFor="server-name">Display Name</label>
                <input
                  className="field"
                  id="server-name"
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12 lg:col-span-6">
                <label htmlFor="server-hostname">Hostname</label>
                <input
                  className="field"
                  id="server-hostname"
                  value={form.hostname}
                  onChange={(event) => setForm((current) => ({ ...current, hostname: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-3">
                <label htmlFor="server-ip">IP Address</label>
                <input
                  className="field"
                  id="server-ip"
                  value={form.ipAddress}
                  onChange={(event) => setForm((current) => ({ ...current, ipAddress: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-2">
                <label htmlFor="server-port">Port</label>
                <input
                  className="field"
                  id="server-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setForm((current) => ({ ...current, port: Number.isFinite(value) ? value : 22 }));
                  }}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-3">
                <label htmlFor="server-credential">Credential</label>
                <select
                  className="select"
                  id="server-credential"
                  value={form.credentialId}
                  onChange={(event) => setForm((current) => ({ ...current, credentialId: event.target.value }))}
                >
                  <option value="">Select credential</option>
                  {credentials.map((credential) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.name} ({credential.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="server-username">Username</label>
                <input
                  className="field"
                  id="server-username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Optional override (defaults to credential username)"
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-3">
                <label htmlFor="server-os">OS Type</label>
                <input
                  className="field"
                  id="server-os"
                  value={form.osType}
                  onChange={(event) => setForm((current) => ({ ...current, osType: event.target.value }))}
                  placeholder="ubuntu, debian, rocky..."
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="server-tags">Tags (comma separated)</label>
                <input
                  className="field"
                  id="server-tags"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="prod, web, critical"
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-2">
                <label htmlFor="server-active">Status</label>
                <select
                  className="select"
                  id="server-active"
                  value={form.active ? "active" : "inactive"}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update Server" : "Create Server"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
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
              <th>Name</th>
              <th>Host</th>
              <th>Access</th>
              <th>Tags</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No servers configured yet.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <p className="m-0 font-semibold">{row.displayName}</p>
                    <p className="m-0 text-xs text-slate-500">{row.osType || "Unknown OS"}</p>
                  </td>
                  <td>
                    <p className="m-0">{row.hostname}</p>
                    <p className="m-0 text-xs text-slate-500">
                      {row.ipAddress}:{row.port}
                    </p>
                  </td>
                  <td>
                    <p className="m-0">{row.credentialName || "No credential"}</p>
                    <p className="m-0 text-xs text-slate-500">{formatServerUsername(row.username)}</p>
                  </td>
                  <td>
                    {row.tags.length === 0 ? (
                      <span className="badge">No tags</span>
                    ) : (
                      <div className="tag-list">
                        {row.tags.map((tag) => (
                          <span className="tag" key={`${row.id}-${tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={row.active ? "badge badge-green" : "badge badge-red"}>
                      {row.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>{formatDateTime(row.updatedAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" type="button" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => void removeServer(row.id)}>
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

      <p className="text-sm text-slate-500">{countWithLabel(rows.length, "server", "servers")} in inventory.</p>
    </Shell>
  );
}
