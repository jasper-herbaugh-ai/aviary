"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../components/api";
import { formatCompactDate } from "../../../components/format";
import { Shell } from "../../../components/shell";

type Job = {
  id: string;
  status: string;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  server: { displayName: string };
  playbook: { name: string };
};

type Result = {
  id: string;
  stepOrder: number;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

function statusClass(status: string): string {
  const value = status.toLowerCase();
  if (value === "success" || value === "completed" || value === "succeeded") return "badge badge-green";
  if (value === "queued" || value === "running") return "badge badge-yellow";
  return "badge badge-red";
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadJob() {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const [jobResponse, resultResponse] = await Promise.all([
          apiFetch<Job>(`/api/v1/jobs/${id}`),
          apiFetch<Result[]>(`/api/v1/jobs/${id}/results`)
        ]);

        setJob(jobResponse);
        setResults(resultResponse);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load job details");
        setJob(null);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }

    void loadJob();
  }, [id]);

  return (
    <Shell
      title="Job Detail"
      subtitle={job ? `Execution trace for ${job.id.slice(0, 8)}` : loading ? "Loading..." : "Job record unavailable"}
    >
      {error ? <p className="error">{error}</p> : null}

      {job ? (
        <article className="panel p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="stat-label">Status</p>
              <span className={statusClass(job.status)}>{job.status}</span>
            </div>
            <div>
              <p className="stat-label">Server</p>
              <p className="m-0 mt-1 text-sm font-semibold">{job.server.displayName}</p>
            </div>
            <div>
              <p className="stat-label">Playbook</p>
              <p className="m-0 mt-1 text-sm font-semibold">{job.playbook.name}</p>
            </div>
            <div>
              <p className="stat-label">Queued</p>
              <p className="m-0 mt-1 text-sm font-semibold">{formatCompactDate(job.enqueuedAt)}</p>
            </div>
          </div>
        </article>
      ) : (
        <article className="panel p-4">
          <div className="empty">{loading ? "Loading job details..." : "Job unavailable."}</div>
        </article>
      )}

      <div className="space-y-3">
        {results.length === 0 ? (
          <article className="panel p-4">
            <div className="empty">No step results have been recorded for this job.</div>
          </article>
        ) : (
          results.map((result) => (
            <article className="panel p-4" key={result.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-sm font-semibold">
                  Step {result.stepOrder}: {result.command}
                </p>
                <span className={result.exitCode === 0 ? "badge badge-green" : "badge badge-red"}>
                  Exit {result.exitCode}
                </span>
              </div>
              <p className="result-meta">Duration: {result.durationMs} ms</p>
              <pre className="result-output">
                {result.stdout || "<no stdout>"}
              </pre>
              {result.stderr ? (
                <pre className="result-output result-output-error">
                  {result.stderr}
                </pre>
              ) : null}
            </article>
          ))
        )}
      </div>
    </Shell>
  );
}
