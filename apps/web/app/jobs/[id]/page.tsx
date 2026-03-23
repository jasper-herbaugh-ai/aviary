"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getAuthToken } from "../../../components/auth";
import { apiBase, apiFetch } from "../../../components/api";
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

type StreamEnvelope = {
  jobId: string;
  seq: number;
  type: string;
  emittedAt: string;
  payload: Record<string, unknown>;
};

function statusClass(status: string): string {
  const value = status.toLowerCase();
  if (value === "success" || value === "completed" || value === "succeeded") return "badge badge-green";
  if (value === "queued" || value === "running") return "badge badge-yellow";
  return "badge badge-red";
}

function upsertResult(current: Result[], incoming: Result): Result[] {
  const next = [...current];
  const index = next.findIndex((entry) => entry.stepOrder === incoming.stepOrder);
  if (index === -1) {
    next.push(incoming);
  } else {
    next[index] = incoming;
  }
  next.sort((a, b) => a.stepOrder - b.stepOrder);
  return next;
}

function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized !== "queued" && normalized !== "running";
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastSeqRef = useRef(0);

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

  useEffect(() => {
    if (!id || isTerminalStatus(job?.status)) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      return;
    }

    const controller = new AbortController();
    let running = true;

    const parseFrame = (rawFrame: string) => {
      const lines = rawFrame.split("\n");
      let eventName = "message";
      let eventId: number | null = null;
      const dataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("event:")) {
          eventName = line.slice("event:".length).trim();
          continue;
        }
        if (line.startsWith("id:")) {
          const parsedId = Number(line.slice("id:".length).trim());
          if (Number.isInteger(parsedId) && parsedId > 0) {
            eventId = parsedId;
            lastSeqRef.current = Math.max(lastSeqRef.current, parsedId);
          }
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      let envelope: StreamEnvelope;
      try {
        envelope = JSON.parse(dataLines.join("\n")) as StreamEnvelope;
      } catch {
        return;
      }

      if (Number.isInteger(envelope.seq) && envelope.seq > 0) {
        lastSeqRef.current = Math.max(lastSeqRef.current, envelope.seq);
      } else if (eventId) {
        envelope.seq = eventId;
      }

      if (eventName === "job.running") {
        setJob((current) =>
          current
            ? {
                ...current,
                status: "running",
                startedAt: current.startedAt ?? envelope.emittedAt
              }
            : current
        );
        return;
      }

      if (eventName === "step.completed") {
        const payload = envelope.payload;
        const stepOrder = Number(payload.stepOrder);
        const exitCode = Number(payload.exitCode);
        const durationMs = Number(payload.durationMs);
        if (!Number.isInteger(stepOrder) || !Number.isFinite(exitCode) || !Number.isFinite(durationMs)) {
          return;
        }

        const streamed: Result = {
          id: `stream-${envelope.seq}`,
          stepOrder,
          command: typeof payload.command === "string" ? payload.command : "__unknown__",
          exitCode,
          stdout: typeof payload.stdout === "string" ? payload.stdout : "",
          stderr: typeof payload.stderr === "string" ? payload.stderr : "",
          durationMs
        };

        setResults((current) => upsertResult(current, streamed));
        return;
      }

      if (eventName === "job.completed") {
        const payload = envelope.payload;
        const nextStatus = typeof payload.status === "string" ? payload.status : "failed";
        setJob((current) =>
          current
            ? {
                ...current,
                status: nextStatus,
                completedAt: current.completedAt ?? envelope.emittedAt
              }
            : current
        );
      }
    };

    const consumeStream = async () => {
      while (running && !controller.signal.aborted) {
        try {
          const headers = new Headers({
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream"
          });

          if (lastSeqRef.current > 0) {
            headers.set("Last-Event-ID", String(lastSeqRef.current));
          }

          const response = await fetch(`${apiBase()}/api/v1/jobs/${id}/events/stream`, {
            method: "GET",
            headers,
            cache: "no-store",
            signal: controller.signal
          });

          if (!response.ok || !response.body) {
            throw new Error(`Unable to connect to event stream (${response.status})`);
          }
          setError(null);

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (running && !controller.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });

            while (true) {
              const boundary = buffer.indexOf("\n\n");
              if (boundary === -1) {
                break;
              }

              const rawFrame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              if (rawFrame.trim().length === 0 || rawFrame.startsWith(":")) {
                continue;
              }
              parseFrame(rawFrame);
            }
          }
        } catch (streamError) {
          if (controller.signal.aborted) {
            break;
          }
          setError(streamError instanceof Error ? streamError.message : "Stream disconnected");
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    };

    void consumeStream();

    return () => {
      running = false;
      controller.abort();
    };
  }, [id, job?.status]);

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
