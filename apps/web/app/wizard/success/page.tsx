"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Shell } from "../../../components/shell";

export default function WizardSuccessPage() {
  const searchParams = useSearchParams();
  const credentialId = searchParams.get("credentialId") ?? "n/a";
  const serverId = searchParams.get("serverId") ?? "n/a";
  const serverName = searchParams.get("serverName") ?? "n/a";
  const scheduleId = searchParams.get("scheduleId") ?? "n/a";
  const cronExpression = searchParams.get("cronExpression") ?? "n/a";

  return (
    <Shell
      title="Wizard Complete"
      subtitle="Automation resources were configured successfully."
      actions={
        <Link className="btn btn-secondary" href="/wizard">
          New Wizard Run
        </Link>
      }
    >
      <p className="notice notice-success">
        Success. Your credential, server, and schedule are now configured.
      </p>

      <article className="panel form-panel">
        <h2 className="mt-0 text-lg font-semibold">Configured Objects</h2>
        <div className="wizard-summary-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="wizard-summary-card col-span-1 rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="wizard-summary-heading">Credential</p>
            <p className="wizard-summary-line">
              <span>ID</span>
              <strong>{credentialId}</strong>
            </p>
          </article>

          <article className="wizard-summary-card col-span-1 rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="wizard-summary-heading">Server</p>
            <p className="wizard-summary-line">
              <span>Name</span>
              <strong>{serverName}</strong>
            </p>
            <p className="wizard-summary-line">
              <span>ID</span>
              <strong>{serverId}</strong>
            </p>
          </article>

          <article className="wizard-summary-card col-span-1 rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="wizard-summary-heading">Schedule</p>
            <p className="wizard-summary-line">
              <span>ID</span>
              <strong>{scheduleId}</strong>
            </p>
            <p className="wizard-summary-line">
              <span>Cron</span>
              <strong>{cronExpression}</strong>
            </p>
          </article>
        </div>
      </article>

      <div className="actions">
        <Link className="btn btn-primary" href="/schedules">
          View Schedules
        </Link>
        <Link className="btn btn-secondary" href="/servers">
          View Servers
        </Link>
        <Link className="btn btn-secondary" href="/credentials">
          View Credentials
        </Link>
      </div>
    </Shell>
  );
}
