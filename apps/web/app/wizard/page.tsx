"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../components/api";
import { readSecretFromFile, secretPlaceholder } from "../../components/credentials";
import { parseServerTags } from "../../components/servers";
import { Shell } from "../../components/shell";

type CredentialType = "ssh_key" | "password";
type ScheduleUnit = "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";

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
  steps: PlaybookStep[];
};

type WizardApiResult = {
  credential: { id: string; name: string };
  server: { id: string; displayName: string };
  schedule: { id: string; cronExpression: string };
};

type CredentialOption = {
  id: string;
  name: string;
  type: CredentialType;
  username: string;
};

type ServerOption = {
  id: string;
  displayName: string;
  hostname: string;
  ipAddress: string;
  port: number;
  credentialId: string | null;
  credentialName: string | null;
};

type SelectionMode = "new" | "existing";

type CredentialFormState = {
  name: string;
  type: CredentialType;
  username: string;
  secretValue: string;
};

type ServerFormState = {
  displayName: string;
  hostname: string;
  ipAddress: string;
  port: number;
  username: string;
  osType: string;
  tags: string;
  active: boolean;
};

type ScheduleFormState = {
  every: number;
  unit: ScheduleUnit;
  useSudo: boolean;
  enabled: boolean;
};

const wizardSteps = [
  { index: 1, title: "Credentials", helper: "Secure login access" },
  { index: 2, title: "Server Details", helper: "Target host details" },
  { index: 3, title: "Playbook Selection", helper: "Choose an automation card" },
  { index: 4, title: "Schedule", helper: "Human interval input" },
  { index: 5, title: "Confirmation", helper: "Review and submit" }
] as const;

const scheduleUnitInfo: Record<ScheduleUnit, { label: string; max: number }> = {
  seconds: { label: "Seconds", max: 59 },
  minutes: { label: "Minutes", max: 59 },
  hours: { label: "Hours", max: 23 },
  days: { label: "Days", max: 31 },
  weeks: { label: "Weeks", max: 4 },
  months: { label: "Months", max: 12 }
};

const initialCredentialForm: CredentialFormState = {
  name: "",
  type: "ssh_key",
  username: "",
  secretValue: ""
};

const initialServerForm: ServerFormState = {
  displayName: "",
  hostname: "",
  ipAddress: "",
  port: 22,
  username: "",
  osType: "",
  tags: "",
  active: true
};

const initialScheduleForm: ScheduleFormState = {
  every: 5,
  unit: "minutes",
  useSudo: false,
  enabled: true
};

const playbookIcons: Record<string, string> = {
  "apt-upgrade": "⬆",
  "dnf-upgrade": "⟳",
  "disk-health-check": "💽",
  "memory-check": "🧠",
  "service-status": "🔧",
  "reboot-check": "🔄",
  "uptime-check": "⏱",
  "journal-errors": "📜",
  "docker-health": "🐳",
  "failed-logins": "🔐",
  "cert-expiry-check": "📆"
};

function toPlaybookTitle(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isScheduleUnit(value: string): value is ScheduleUnit {
  return value in scheduleUnitInfo;
}

function scheduleSummary(form: ScheduleFormState): string {
  const suffix = form.every === 1 ? scheduleUnitInfo[form.unit].label.slice(0, -1) : scheduleUnitInfo[form.unit].label;
  return `Every ${form.every} ${suffix.toLowerCase()}`;
}

export default function WizardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [uploadedSecretFileName, setUploadedSecretFileName] = useState<string | null>(null);
  const [credentialMode, setCredentialMode] = useState<SelectionMode>("new");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [credentialForm, setCredentialForm] = useState<CredentialFormState>(initialCredentialForm);
  const [serverMode, setServerMode] = useState<SelectionMode>("new");
  const [selectedServerId, setSelectedServerId] = useState("");
  const [serverForm, setServerForm] = useState<ServerFormState>(initialServerForm);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState("");
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(initialScheduleForm);

  const selectedCredential = useMemo(
    () => credentials.find((credential) => credential.id === selectedCredentialId) ?? null,
    [credentials, selectedCredentialId]
  );

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const selectedPlaybook = useMemo(
    () => playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null,
    [playbooks, selectedPlaybookId]
  );

  const scheduleUnit = scheduleUnitInfo[scheduleForm.unit];

  useEffect(() => {
    async function loadWizardData() {
      setLoading(true);
      setError(null);
      try {
        const [playbookResponse, credentialResponse, serverResponse] = await Promise.all([
          apiFetch<Playbook[]>("/api/v1/playbooks"),
          apiFetch<CredentialOption[]>("/api/v1/credentials"),
          apiFetch<ServerOption[]>("/api/v1/servers")
        ]);

        const sorted = [...playbookResponse].sort((a, b) => {
          if (a.isBuiltin !== b.isBuiltin) {
            return a.isBuiltin ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        setCredentials(credentialResponse);
        setServers(serverResponse);
        setPlaybooks(sorted);
        setSelectedCredentialId((current) => current || credentialResponse[0]?.id || "");
        setSelectedServerId((current) => current || serverResponse[0]?.id || "");
        setSelectedPlaybookId((current) => {
          const nextPlaybookId = current || sorted[0]?.id || "";
          setScheduleForm((currentSchedule) => ({
            ...currentSchedule,
            useSudo: sorted.find((playbook) => playbook.id === nextPlaybookId)?.useSudo ?? currentSchedule.useSudo
          }));
          return nextPlaybookId;
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load wizard data");
      } finally {
        setLoading(false);
      }
    }

    void loadWizardData();
  }, []);

  function validateCredentials(): string | null {
    if (credentialMode === "existing") {
      if (credentials.length === 0) return "No existing credentials are available. Choose Create New instead.";
      if (!selectedCredentialId) return "Select an existing credential.";
      return null;
    }

    if (!credentialForm.name.trim()) return "Credential name is required.";
    if (!credentialForm.username.trim()) return "Credential username is required.";
    if (!credentialForm.secretValue.trim()) return "Credential secret value is required.";
    return null;
  }

  function validateServer(): string | null {
    if (serverMode === "existing") {
      if (servers.length === 0) return "No existing servers are available. Choose Create New instead.";
      if (!selectedServerId) return "Select an existing server.";
      return null;
    }

    if (!serverForm.displayName.trim()) return "Server display name is required.";
    if (!serverForm.hostname.trim()) return "Server hostname is required.";
    if (!serverForm.ipAddress.trim()) return "Server IP address is required.";
    if (!Number.isInteger(serverForm.port) || serverForm.port < 1 || serverForm.port > 65535) {
      return "Server port must be between 1 and 65535.";
    }
    return null;
  }

  function validatePlaybook(): string | null {
    if (playbooks.length === 0) return "No playbooks are available. Create one first.";
    if (!selectedPlaybookId) return "Playbook selection is required.";
    return null;
  }

  function validateSchedule(): string | null {
    if (!Number.isInteger(scheduleForm.every) || scheduleForm.every < 1) {
      return "Schedule interval must be a positive integer.";
    }
    if (scheduleForm.every > scheduleUnit.max) {
      return `Maximum interval for ${scheduleUnit.label.toLowerCase()} is ${scheduleUnit.max}.`;
    }
    return null;
  }

  function validateStep(stepIndex: number): string | null {
    if (stepIndex === 1) return validateCredentials();
    if (stepIndex === 2) return validateServer();
    if (stepIndex === 3) return validatePlaybook();
    if (stepIndex === 4) return validateSchedule();
    return null;
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function goNext() {
    const issue = validateStep(step);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setStep((current) => Math.min(5, current + 1));
  }

  function resetWizard() {
    setStep(1);
    setError(null);
    setUploadedSecretFileName(null);
    setCredentialMode("new");
    setSelectedCredentialId(credentials[0]?.id ?? "");
    setCredentialForm(initialCredentialForm);
    setServerMode("new");
    setSelectedServerId(servers[0]?.id ?? "");
    setServerForm(initialServerForm);
    setScheduleForm({
      ...initialScheduleForm,
      useSudo: playbooks[0]?.useSudo ?? false
    });
    setSelectedPlaybookId(playbooks[0]?.id ?? "");
  }

  async function onSecretFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const contents = await readSecretFromFile(file);
      setCredentialForm((current) => ({ ...current, secretValue: contents }));
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

    if (step < 5) {
      goNext();
      return;
    }

    for (const stepIndex of [1, 2, 3, 4]) {
      const issue = validateStep(stepIndex);
      if (issue) {
        setStep(stepIndex);
        setError(issue);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiFetch<WizardApiResult>("/api/v1/wizard/automation", {
        method: "POST",
        body: {
          credential:
            credentialMode === "existing"
              ? {
                  mode: "existing" as const,
                  id: selectedCredentialId
                }
              : {
                  mode: "new" as const,
                  name: credentialForm.name.trim(),
                  type: credentialForm.type,
                  username: credentialForm.username.trim(),
                  secretValue: credentialForm.secretValue
                },
          server:
            serverMode === "existing"
              ? {
                  mode: "existing" as const,
                  id: selectedServerId
                }
              : {
                  mode: "new" as const,
                  displayName: serverForm.displayName.trim(),
                  hostname: serverForm.hostname.trim(),
                  ipAddress: serverForm.ipAddress.trim(),
                  port: Number(serverForm.port),
                  username: serverForm.username.trim() || null,
                  osType: serverForm.osType.trim() || null,
                  tags: parseServerTags(serverForm.tags),
                  active: serverForm.active
                },
          playbookId: selectedPlaybookId,
          schedule: {
            every: Number(scheduleForm.every),
            unit: scheduleForm.unit,
            useSudo: scheduleForm.useSudo,
            enabled: scheduleForm.enabled
          }
        }
      });

      const params = new URLSearchParams({
        credentialId: response.credential.id,
        serverId: response.server.id,
        scheduleId: response.schedule.id,
        cronExpression: response.schedule.cronExpression,
        serverName: response.server.displayName
      });
      router.push(`/wizard/success?${params.toString()}`);
      return;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit wizard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell
      title="Automation Wizard"
      subtitle="Guided setup for credentials, target server, playbook selection, and scheduling."
      actions={
        <button className="btn btn-secondary" type="button" onClick={resetWizard} disabled={submitting}>
          Start Over
        </button>
      }
    >
      {error ? <p className="error">{error}</p> : null}

      <article className="panel wizard-progress !grid !gap-2 !p-3 md:!grid-cols-2 xl:!grid-cols-5">
        {wizardSteps.map((wizardStep) => {
          const status =
            step === wizardStep.index ? "active" : step > wizardStep.index ? "complete" : "pending";
          return (
            <div
              key={wizardStep.index}
              className={`wizard-progress-item wizard-progress-${status} !flex !items-center !gap-2 !rounded-xl !border !border-slate-200 !bg-slate-50 !p-2`}
            >
              <div className="wizard-progress-index !grid !h-7 !w-7 !place-items-center !rounded-full !bg-blue-100 !text-xs !font-bold !text-blue-800">
                {wizardStep.index}
              </div>
              <div>
                <p className="wizard-progress-title !m-0 !text-xs !font-bold !text-slate-800">{wizardStep.title}</p>
                <p className="wizard-progress-helper !m-0 !text-xs !text-slate-500">{wizardStep.helper}</p>
              </div>
            </div>
          );
        })}
      </article>

      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <article className="panel form-panel">
          {step === 1 ? (
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-5">
                <label htmlFor="wizard-credential-mode">Credential Source</label>
                <select
                  className="select"
                  id="wizard-credential-mode"
                  value={credentialMode}
                  onChange={(event) => {
                    const mode: SelectionMode = event.target.value === "existing" ? "existing" : "new";
                    setCredentialMode(mode);
                    if (mode === "existing") {
                      setSelectedCredentialId((current) => current || credentials[0]?.id || "");
                      setUploadedSecretFileName(null);
                    }
                    setError(null);
                  }}
                >
                  <option value="new">Create New</option>
                  <option value="existing">Use Existing</option>
                </select>
              </div>

              {credentialMode === "existing" ? (
                <>
                  <div className="field-wrap col-span-12 md:col-span-7">
                    <label htmlFor="wizard-credential-existing">Existing Credential</label>
                    <select
                      className="select"
                      id="wizard-credential-existing"
                      value={selectedCredentialId}
                      onChange={(event) => setSelectedCredentialId(event.target.value)}
                      disabled={loading || credentials.length === 0}
                    >
                      {credentials.length === 0 ? <option value="">No credentials found</option> : null}
                      {credentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name} ({credential.username})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-wrap col-span-12">
                    <p className="m-0 text-xs text-slate-500">
                      {selectedCredential
                        ? `Selected: ${selectedCredential.name} (${selectedCredential.type === "ssh_key" ? "SSH Key" : "Password"})`
                        : "Select an existing credential to continue."}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="field-wrap col-span-12 md:col-span-5">
                    <label htmlFor="wizard-credential-name">Credential Name</label>
                    <input
                      className="field"
                      id="wizard-credential-name"
                      value={credentialForm.name}
                      onChange={(event) => setCredentialForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Prod SSH Key"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-3">
                    <label htmlFor="wizard-credential-type">Type</label>
                    <select
                      className="select"
                      id="wizard-credential-type"
                      value={credentialForm.type}
                      onChange={(event) => {
                        const type = event.target.value === "password" ? "password" : "ssh_key";
                        setCredentialForm((current) => ({ ...current, type }));
                        if (type === "password") {
                          setUploadedSecretFileName(null);
                        }
                      }}
                    >
                      <option value="ssh_key">SSH Key</option>
                      <option value="password">Password</option>
                    </select>
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-4">
                    <label htmlFor="wizard-credential-username">Username</label>
                    <input
                      className="field"
                      id="wizard-credential-username"
                      value={credentialForm.username}
                      onChange={(event) => setCredentialForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="ubuntu"
                    />
                  </div>

                  <div className="field-wrap col-span-12">
                    <label htmlFor="wizard-credential-secret">Secret Value</label>
                    <textarea
                      className="textarea"
                      id="wizard-credential-secret"
                      value={credentialForm.secretValue}
                      onChange={(event) => {
                        setCredentialForm((current) => ({ ...current, secretValue: event.target.value }));
                        if (!event.target.value) {
                          setUploadedSecretFileName(null);
                        }
                      }}
                      placeholder={secretPlaceholder(credentialForm.type)}
                    />
                  </div>

                  {credentialForm.type === "ssh_key" ? (
                    <div className="field-wrap col-span-12 md:col-span-7">
                      <label htmlFor="wizard-credential-file">Upload Private Key File</label>
                      <input
                        className="field"
                        id="wizard-credential-file"
                        type="file"
                        onChange={(event) => void onSecretFileChange(event)}
                      />
                      <p className="m-0 text-xs text-slate-500">
                        {uploadedSecretFileName
                          ? `Loaded: ${uploadedSecretFileName}`
                          : "Optional helper to prefill secret from file."}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-5">
                <label htmlFor="wizard-server-mode">Server Source</label>
                <select
                  className="select"
                  id="wizard-server-mode"
                  value={serverMode}
                  onChange={(event) => {
                    const mode: SelectionMode = event.target.value === "existing" ? "existing" : "new";
                    setServerMode(mode);
                    if (mode === "existing") {
                      setSelectedServerId((current) => current || servers[0]?.id || "");
                    }
                    setError(null);
                  }}
                >
                  <option value="new">Create New</option>
                  <option value="existing">Use Existing</option>
                </select>
              </div>

              {serverMode === "existing" ? (
                <>
                  <div className="field-wrap col-span-12 md:col-span-7">
                    <label htmlFor="wizard-server-existing">Existing Server</label>
                    <select
                      className="select"
                      id="wizard-server-existing"
                      value={selectedServerId}
                      onChange={(event) => setSelectedServerId(event.target.value)}
                      disabled={loading || servers.length === 0}
                    >
                      {servers.length === 0 ? <option value="">No servers found</option> : null}
                      {servers.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.displayName} ({server.hostname})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-wrap col-span-12">
                    <p className="m-0 text-xs text-slate-500">
                      {selectedServer
                        ? `Selected: ${selectedServer.displayName} at ${selectedServer.ipAddress}:${selectedServer.port}`
                        : "Select an existing server to continue."}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="field-wrap col-span-12 md:col-span-6">
                    <label htmlFor="wizard-server-name">Display Name</label>
                    <input
                      className="field"
                      id="wizard-server-name"
                      value={serverForm.displayName}
                      onChange={(event) => setServerForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="Production Web 1"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-6">
                    <label htmlFor="wizard-server-hostname">Hostname</label>
                    <input
                      className="field"
                      id="wizard-server-hostname"
                      value={serverForm.hostname}
                      onChange={(event) => setServerForm((current) => ({ ...current, hostname: event.target.value }))}
                      placeholder="web-1.prod.internal"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-4">
                    <label htmlFor="wizard-server-ip">IP Address</label>
                    <input
                      className="field"
                      id="wizard-server-ip"
                      value={serverForm.ipAddress}
                      onChange={(event) => setServerForm((current) => ({ ...current, ipAddress: event.target.value }))}
                      placeholder="10.0.0.12"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-2">
                    <label htmlFor="wizard-server-port">Port</label>
                    <input
                      className="field"
                      id="wizard-server-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={serverForm.port}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setServerForm((current) => ({ ...current, port: Number.isFinite(value) ? value : 22 }));
                      }}
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-3">
                    <label htmlFor="wizard-server-username">Server Username (optional)</label>
                    <input
                      className="field"
                      id="wizard-server-username"
                      value={serverForm.username}
                      onChange={(event) => setServerForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Leave blank for credential username"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-3">
                    <label htmlFor="wizard-server-os">OS Type (optional)</label>
                    <input
                      className="field"
                      id="wizard-server-os"
                      value={serverForm.osType}
                      onChange={(event) => setServerForm((current) => ({ ...current, osType: event.target.value }))}
                      placeholder="ubuntu"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-9">
                    <label htmlFor="wizard-server-tags">Tags (comma separated)</label>
                    <input
                      className="field"
                      id="wizard-server-tags"
                      value={serverForm.tags}
                      onChange={(event) => setServerForm((current) => ({ ...current, tags: event.target.value }))}
                      placeholder="prod, web, linux"
                    />
                  </div>

                  <div className="field-wrap col-span-12 md:col-span-3">
                    <label htmlFor="wizard-server-active">Status</label>
                    <select
                      className="select"
                      id="wizard-server-active"
                      value={serverForm.active ? "active" : "inactive"}
                      onChange={(event) => setServerForm((current) => ({ ...current, active: event.target.value === "active" }))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="m-0 text-sm text-slate-600">Choose the playbook to run for this automation.</p>
              {loading ? (
                <div className="empty">Loading playbooks...</div>
              ) : playbooks.length === 0 ? (
                <div className="empty">No playbooks are available yet.</div>
              ) : (
                <div className="wizard-card-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {playbooks.map((playbook) => {
                    const selected = selectedPlaybookId === playbook.id;
                    return (
                      <button
                        key={playbook.id}
                        className={`wizard-card col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-white ${selected ? "wizard-card-selected border-blue-500 bg-blue-50" : ""}`}
                        type="button"
                        onClick={() => {
                          setSelectedPlaybookId(playbook.id);
                          setScheduleForm((current) => ({ ...current, useSudo: playbook.useSudo }));
                          setError(null);
                        }}
                      >
                        <div className="wizard-card-icon grid h-9 w-9 place-items-center rounded-lg bg-blue-100 text-base" aria-hidden>
                          {playbookIcons[playbook.name] ?? "🛠"}
                        </div>
                        <div className="wizard-card-content">
                          <p className="wizard-card-title m-0 text-sm font-semibold text-slate-800">
                            {toPlaybookTitle(playbook.name)}
                          </p>
                          <p className="wizard-card-meta m-0 mt-1 text-xs text-slate-500">
                            {playbook.isBuiltin ? "Built-in" : "Custom"} · {playbook.steps.length} steps
                          </p>
                          <p className="wizard-card-description m-0 mt-2 text-sm text-slate-600">
                            {playbook.description ?? "No description provided."}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="form-grid">
              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="wizard-schedule-every">Run Every</label>
                <input
                  className="field"
                  id="wizard-schedule-every"
                  type="number"
                  min={1}
                  max={scheduleUnit.max}
                  value={scheduleForm.every}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setScheduleForm((current) => ({
                      ...current,
                      every: Number.isFinite(value) ? Math.floor(value) : 1
                    }));
                  }}
                />
              </div>

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="wizard-schedule-unit">Unit</label>
                <select
                  className="select"
                  id="wizard-schedule-unit"
                  value={scheduleForm.unit}
                  onChange={(event) => {
                    const nextUnit = event.target.value;
                    if (!isScheduleUnit(nextUnit)) return;
                    const max = scheduleUnitInfo[nextUnit].max;
                    setScheduleForm((current) => ({
                      ...current,
                      unit: nextUnit,
                      every: Math.min(current.every, max)
                    }));
                  }}
                >
                  {(Object.entries(scheduleUnitInfo) as Array<[ScheduleUnit, { label: string; max: number }]>).map(
                    ([value, info]) => (
                      <option key={value} value={value}>
                        {info.label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="wizard-schedule-privilege">Privilege</label>
                <select
                  className="select"
                  id="wizard-schedule-privilege"
                  value={scheduleForm.useSudo ? "sudo" : "standard"}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, useSudo: event.target.value === "sudo" }))
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="sudo">Use sudo -n</option>
                </select>
              </div>

              <div className="field-wrap col-span-12 md:col-span-3">
                <label htmlFor="wizard-schedule-state">Schedule State</label>
                <select
                  className="select"
                  id="wizard-schedule-state"
                  value={scheduleForm.enabled ? "enabled" : "disabled"}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, enabled: event.target.value === "enabled" }))}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="col-span-12 wizard-schedule-note rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                <p className="m-0">
                  Backend conversion: <strong>{scheduleSummary(scheduleForm)}</strong> will be converted to cron automatically.
                </p>
                <p className="m-0 text-xs text-slate-500">Maximum for {scheduleUnit.label.toLowerCase()}: {scheduleUnit.max}</p>
                {scheduleForm.unit === "weeks" ? (
                  <p className="m-0 text-xs text-slate-500">Weekly intervals are converted as 7-day cron steps.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="wizard-summary-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article className="wizard-summary-card col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="wizard-summary-heading">1. Credentials</p>
                <p className="wizard-summary-line">
                  <span>Mode</span>
                  <strong>{credentialMode === "existing" ? "Existing" : "New"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Name</span>
                  <strong>{credentialMode === "existing" ? selectedCredential?.name || "Not set" : credentialForm.name || "Not set"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Username</span>
                  <strong>{credentialMode === "existing" ? selectedCredential?.username || "Not set" : credentialForm.username || "Not set"}</strong>
                </p>
              </article>

              <article className="wizard-summary-card col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="wizard-summary-heading">2. Server</p>
                <p className="wizard-summary-line">
                  <span>Mode</span>
                  <strong>{serverMode === "existing" ? "Existing" : "New"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Display Name</span>
                  <strong>{serverMode === "existing" ? selectedServer?.displayName || "Not set" : serverForm.displayName || "Not set"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Host</span>
                  <strong>
                    {serverMode === "existing"
                      ? selectedServer?.hostname || "Not set"
                      : serverForm.hostname || "Not set"}
                  </strong>
                </p>
              </article>

              <article className="wizard-summary-card col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="wizard-summary-heading">3. Playbook</p>
                <p className="wizard-summary-line">
                  <span>Selected</span>
                  <strong>{selectedPlaybook ? toPlaybookTitle(selectedPlaybook.name) : "Not set"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Type</span>
                  <strong>{selectedPlaybook?.isBuiltin ? "Built-in" : selectedPlaybook ? "Custom" : "Not set"}</strong>
                </p>
              </article>

              <article className="wizard-summary-card col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="wizard-summary-heading">4. Schedule</p>
                <p className="wizard-summary-line">
                  <span>Interval</span>
                  <strong>{scheduleSummary(scheduleForm)}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>State</span>
                  <strong>{scheduleForm.enabled ? "Enabled" : "Disabled"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Privilege</span>
                  <strong>{scheduleForm.useSudo ? "sudo -n" : "standard"}</strong>
                </p>
                <p className="wizard-summary-line">
                  <span>Target</span>
                  <strong>
                    {serverMode === "existing"
                      ? selectedServer
                        ? `Existing server: ${selectedServer.displayName}`
                        : "Existing server"
                      : "New server from Step 2"}
                  </strong>
                </p>
              </article>

            </div>
          ) : null}
        </article>

        <div className="actions wizard-actions">
          <button className="btn btn-secondary" type="button" onClick={goBack} disabled={step === 1 || submitting}>
            Back
          </button>

          <button className="btn btn-primary" type="submit" disabled={submitting || (step === 3 && loading)}>
            {submitting ? "Submitting..." : step < 5 ? "Next Step" : "Submit Wizard"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
