"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../components/api";
import { readSecretFromFile, secretPlaceholder } from "../../components/credentials";
import { formatDateTime } from "../../components/format";
import { Shell } from "../../components/shell";

type CredentialType = "ssh_key" | "password";

type Credential = {
  id: string;
  name: string;
  type: CredentialType;
  username: string;
  createdAt: string;
};

type CredentialFormState = {
  name: string;
  type: CredentialType;
  username: string;
  secretValue: string;
};

const initialForm: CredentialFormState = {
  name: "",
  type: "ssh_key",
  username: "",
  secretValue: ""
};

export default function CredentialsPage() {
  const [rows, setRows] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CredentialFormState>(initialForm);
  const [uploadedSecretFileName, setUploadedSecretFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sshKeyCount = useMemo(() => rows.filter((row) => row.type === "ssh_key").length, [rows]);

  async function loadCredentials() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<Credential[]>("/api/v1/credentials");
      setRows(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load credentials");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCredentials();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setUploadedSecretFileName(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(row: Credential) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      type: row.type,
      username: row.username,
      secretValue: ""
    });
    setUploadedSecretFileName(null);
    setShowForm(true);
    setError(null);
  }

  async function onSecretFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const contents = await readSecretFromFile(file);
      setForm((current) => ({ ...current, secretValue: contents }));
      setUploadedSecretFileName(file.name);
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read selected file.");
    } finally {
      event.target.value = "";
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.name.trim() || !form.username.trim()) {
      setError("Credential name and username are required.");
      return;
    }

    if (!editingId && !form.secretValue.trim()) {
      setError("A secret value is required when creating a credential.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      type: form.type,
      username: form.username.trim(),
      ...(form.secretValue.trim() ? { secretValue: form.secretValue } : {})
    };

    try {
      if (editingId) {
        await apiFetch(`/api/v1/credentials/${editingId}`, { method: "PATCH", body: payload });
      } else {
        await apiFetch("/api/v1/credentials", { method: "POST", body: payload });
      }

      setForm(initialForm);
      setUploadedSecretFileName(null);
      setEditingId(null);
      setShowForm(false);
      await loadCredentials();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save credential");
    } finally {
      setSaving(false);
    }
  }

  async function removeCredential(id: string) {
    const confirmed = window.confirm("Delete this credential?");
    if (!confirmed) return;

    setError(null);
    try {
      await apiFetch(`/api/v1/credentials/${id}`, { method: "DELETE" });
      if (editingId === id) {
        setEditingId(null);
        setShowForm(false);
        setForm(initialForm);
      }
      await loadCredentials();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete credential");
    }
  }

  return (
    <Shell
      title="Credentials"
      subtitle="Store SSH keys and passwords used by target hosts."
      actions={
        <>
          <button className="btn btn-secondary" type="button" onClick={() => void loadCredentials()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            New Credential
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Total Credentials</p>
          <p className="stat-value">{rows.length}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">SSH Keys</p>
          <p className="stat-value">{sshKeyCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Passwords</p>
          <p className="stat-value">{rows.length - sshKeyCount}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Ready For Assignment</p>
          <p className="stat-value">{rows.length}</p>
        </article>
      </section>

      {showForm ? (
        <article className="panel form-panel">
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-4">
                <label htmlFor="credential-name">Name</label>
                <input
                  className="field"
                  id="credential-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-3">
                <label htmlFor="credential-type">Type</label>
                <select
                  className="select"
                  id="credential-type"
                  value={form.type}
                  onChange={(event) => {
                    const nextType = event.target.value === "password" ? "password" : "ssh_key";
                    setForm((current) => ({
                      ...current,
                      type: nextType
                    }));
                    if (nextType === "password") {
                      setUploadedSecretFileName(null);
                    }
                  }}
                >
                  <option value="ssh_key">SSH Key</option>
                  <option value="password">Password</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-6 lg:col-span-5">
                <label htmlFor="credential-username">Username</label>
                <input
                  className="field"
                  id="credential-username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                />
              </div>

              <div className="field-wrap col-span-12">
                <label htmlFor="credential-secret">
                  Secret Value {editingId ? "(leave blank to keep current secret)" : ""}
                </label>
                <textarea
                  className="textarea"
                  id="credential-secret"
                  value={form.secretValue}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, secretValue: event.target.value }));
                    if (!event.target.value) {
                      setUploadedSecretFileName(null);
                    }
                  }}
                  placeholder={secretPlaceholder(form.type)}
                />
              </div>

              {form.type === "ssh_key" ? (
                <div className="field-wrap col-span-12 md:col-span-8 lg:col-span-6">
                  <label htmlFor="credential-secret-file">Upload Private Key File</label>
                  <input
                    className="field"
                    id="credential-secret-file"
                    type="file"
                    onChange={(event) => void onSecretFileChange(event)}
                  />
                  <p className="m-0 text-xs text-slate-500">
                    {uploadedSecretFileName
                      ? `Loaded: ${uploadedSecretFileName}`
                      : "Upload a key file to populate Secret Value automatically (.pub and extensionless files supported)."}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update Credential" : "Create Credential"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setShowForm(false);
                  setForm(initialForm);
                  setUploadedSecretFileName(null);
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
              <th>Type</th>
              <th>Username</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">No credentials created yet.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <p className="m-0 font-semibold">{row.name}</p>
                    <p className="m-0 text-xs text-slate-500">ID {row.id.slice(0, 8)}</p>
                  </td>
                  <td>
                    <span className={row.type === "ssh_key" ? "badge badge-green" : "badge badge-yellow"}>
                      {row.type === "ssh_key" ? "ssh_key" : "password"}
                    </span>
                  </td>
                  <td>{row.username}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary" type="button" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => void removeCredential(row.id)}>
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
