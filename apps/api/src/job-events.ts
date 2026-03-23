import { Prisma, type PrismaClient } from "@aviary/db";

export type PersistedJobEvent = {
  jobId: string;
  seq: number;
  eventType: string;
  payload: unknown;
  emittedAt: Date;
};

type JobEventSubscriber = (event: PersistedJobEvent) => void;

export class JobEventBroker {
  private readonly subscribers = new Map<string, Set<JobEventSubscriber>>();

  subscribe(jobId: string, subscriber: JobEventSubscriber): () => void {
    const existing = this.subscribers.get(jobId);
    const bucket = existing ?? new Set<JobEventSubscriber>();
    bucket.add(subscriber);
    this.subscribers.set(jobId, bucket);

    return () => {
      const current = this.subscribers.get(jobId);
      if (!current) return;
      current.delete(subscriber);
      if (current.size === 0) {
        this.subscribers.delete(jobId);
      }
    };
  }

  publish(event: PersistedJobEvent): void {
    const subscribers = this.subscribers.get(event.jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }
}

function toPersistedEvent(row: {
  jobId: string;
  seq: number;
  eventType: string;
  payload: Prisma.JsonValue;
  emittedAt: Date;
}): PersistedJobEvent {
  return {
    jobId: row.jobId,
    seq: row.seq,
    eventType: row.eventType,
    payload: row.payload,
    emittedAt: row.emittedAt
  };
}

export async function appendJobEvent(
  db: PrismaClient,
  input: {
    jobId: string;
    seq: number;
    eventType: string;
    payload: Prisma.InputJsonValue;
    emittedAt: Date;
  }
): Promise<PersistedJobEvent> {
  try {
    const created = await db.jobEvent.create({
      data: {
        jobId: input.jobId,
        seq: input.seq,
        eventType: input.eventType,
        payload: input.payload,
        emittedAt: input.emittedAt
      }
    });
    return toPersistedEvent(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.jobEvent.findUnique({
        where: {
          jobId_seq: {
            jobId: input.jobId,
            seq: input.seq
          }
        }
      });

      if (existing) {
        return toPersistedEvent(existing);
      }
    }

    throw error;
  }
}

export async function listJobEventsAfter(
  db: PrismaClient,
  input: {
    jobId: string;
    afterSeq: number;
    limit?: number;
  }
): Promise<PersistedJobEvent[]> {
  const rows = await db.jobEvent.findMany({
    where: {
      jobId: input.jobId,
      seq: { gt: input.afterSeq }
    },
    orderBy: { seq: "asc" },
    take: input.limit ?? 500
  });

  return rows.map(toPersistedEvent);
}

export function parseCursorValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function parsePayloadJson(value: string): Prisma.InputJsonValue {
  if (!value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (parsed === null) {
    return {};
  }

  if (Array.isArray(parsed)) {
    return parsed as Prisma.InputJsonValue;
  }

  if (typeof parsed === "object") {
    return parsed as Prisma.InputJsonValue;
  }

  return { value: parsed };
}

export function toSseFrame(event: PersistedJobEvent): string {
  const payload = JSON.stringify({
    jobId: event.jobId,
    seq: event.seq,
    type: event.eventType,
    emittedAt: event.emittedAt.toISOString(),
    payload: event.payload
  });

  return `id: ${event.seq}\nevent: ${event.eventType}\ndata: ${payload}\n\n`;
}

export function toSseHeartbeat(): string {
  return ": keepalive\n\n";
}
