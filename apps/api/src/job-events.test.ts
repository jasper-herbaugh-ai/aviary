import { describe, expect, it, vi } from "vitest";

vi.mock("@aviary/db", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, meta: { code: string }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = meta.code;
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
    PrismaClient: vi.fn(),
  };
});

import {
  JobEventBroker,
  appendJobEvent,
  listJobEventsAfter,
  parseCursorValue,
  parsePayloadJson,
  toSseFrame,
  toSseHeartbeat,
} from "./job-events.js";

// ── parseCursorValue ─────────────────────────────────────────────────────────

describe("parseCursorValue", () => {
  it("returns null for undefined", () => {
    expect(parseCursorValue(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCursorValue("")).toBeNull();
  });

  it("returns 0 for string '0'", () => {
    expect(parseCursorValue("0")).toBe(0);
  });

  it("parses a positive integer string", () => {
    expect(parseCursorValue("42")).toBe(42);
  });

  it("returns null for a negative number string", () => {
    expect(parseCursorValue("-1")).toBeNull();
  });

  it("returns null for a float string", () => {
    expect(parseCursorValue("3.14")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseCursorValue("abc")).toBeNull();
  });
});

// ── parsePayloadJson ─────────────────────────────────────────────────────────

describe("parsePayloadJson", () => {
  it("returns empty object for an empty string", () => {
    expect(parsePayloadJson("")).toEqual({});
  });

  it("returns empty object for a whitespace-only string", () => {
    expect(parsePayloadJson("   ")).toEqual({});
  });

  it("parses a JSON object", () => {
    expect(parsePayloadJson('{"key":"val","n":1}')).toEqual({ key: "val", n: 1 });
  });

  it("parses a JSON array", () => {
    expect(parsePayloadJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("returns empty object for JSON null", () => {
    expect(parsePayloadJson("null")).toEqual({});
  });

  it("wraps a numeric scalar in {value}", () => {
    expect(parsePayloadJson("42")).toEqual({ value: 42 });
  });

  it("wraps a boolean scalar in {value}", () => {
    expect(parsePayloadJson("true")).toEqual({ value: true });
  });

  it("wraps a string scalar in {value}", () => {
    expect(parsePayloadJson('"hello"')).toEqual({ value: "hello" });
  });

  it("throws for invalid JSON", () => {
    expect(() => parsePayloadJson("{bad}")).toThrow();
  });
});

// ── toSseFrame ───────────────────────────────────────────────────────────────

describe("toSseFrame", () => {
  const event = {
    jobId: "job-abc",
    seq: 7,
    eventType: "log",
    payload: { msg: "hi" },
    emittedAt: new Date("2026-01-15T12:00:00.000Z"),
  };

  it("starts with id and event lines followed by data and blank line", () => {
    const frame = toSseFrame(event);
    expect(frame).toMatch(/^id: 7\nevent: log\ndata: /);
    expect(frame.endsWith("\n\n")).toBe(true);
  });

  it("embeds jobId, seq, type, and emittedAt in the data payload", () => {
    const frame = toSseFrame(event);
    const dataLine = frame.split("\n").find((l) => l.startsWith("data: "))!;
    const parsed = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
    expect(parsed.jobId).toBe("job-abc");
    expect(parsed.seq).toBe(7);
    expect(parsed.type).toBe("log");
    expect(parsed.emittedAt).toBe("2026-01-15T12:00:00.000Z");
    expect(parsed.payload).toEqual({ msg: "hi" });
  });
});

// ── toSseHeartbeat ───────────────────────────────────────────────────────────

describe("toSseHeartbeat", () => {
  it("returns the SSE keepalive frame", () => {
    expect(toSseHeartbeat()).toBe(": keepalive\n\n");
  });
});

// ── JobEventBroker ───────────────────────────────────────────────────────────

describe("JobEventBroker", () => {
  const makeEvent = (jobId: string, seq = 1) => ({
    jobId,
    seq,
    eventType: "log",
    payload: {},
    emittedAt: new Date(),
  });

  it("delivers published events to matching subscriber", () => {
    const broker = new JobEventBroker();
    const received: unknown[] = [];
    broker.subscribe("job-1", (e) => received.push(e));

    const ev = makeEvent("job-1");
    broker.publish(ev);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(ev);
  });

  it("does not deliver events to subscribers for a different jobId", () => {
    const broker = new JobEventBroker();
    const received: unknown[] = [];
    broker.subscribe("job-2", (e) => received.push(e));

    broker.publish(makeEvent("job-1"));

    expect(received).toHaveLength(0);
  });

  it("delivers events to multiple subscribers for the same jobId", () => {
    const broker = new JobEventBroker();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    broker.subscribe("job-1", (e) => r1.push(e));
    broker.subscribe("job-1", (e) => r2.push(e));

    broker.publish(makeEvent("job-1"));

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it("stops delivering after unsubscribe", () => {
    const broker = new JobEventBroker();
    const received: unknown[] = [];
    const unsub = broker.subscribe("job-1", (e) => received.push(e));

    unsub();
    broker.publish(makeEvent("job-1"));

    expect(received).toHaveLength(0);
  });

  it("removes job entry from internal map after last unsubscribe", () => {
    const broker = new JobEventBroker();
    const received: unknown[] = [];
    const unsub = broker.subscribe("job-1", (e) => received.push(e));

    unsub();
    // A second publish must be a no-op, not throw
    expect(() => broker.publish(makeEvent("job-1"))).not.toThrow();
    expect(received).toHaveLength(0);
  });

  it("handles partial unsubscribe — remaining subscriber still receives", () => {
    const broker = new JobEventBroker();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    broker.subscribe("job-1", (e) => r1.push(e));
    const unsub2 = broker.subscribe("job-1", (e) => r2.push(e));

    unsub2();
    broker.publish(makeEvent("job-1"));

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);
  });

  it("publish is a no-op when no subscribers exist for the jobId", () => {
    const broker = new JobEventBroker();
    expect(() => broker.publish(makeEvent("unknown-job"))).not.toThrow();
  });
});

// ── appendJobEvent ───────────────────────────────────────────────────────────

describe("appendJobEvent", () => {
  it("creates and returns the persisted event", async () => {
    const now = new Date();
    const row = { jobId: "j1", seq: 1, eventType: "log", payload: {}, emittedAt: now };
    const db = {
      jobEvent: { create: vi.fn().mockResolvedValue(row) },
    } as unknown as Parameters<typeof appendJobEvent>[0];

    const result = await appendJobEvent(db, {
      jobId: "j1",
      seq: 1,
      eventType: "log",
      payload: {},
      emittedAt: now,
    });

    expect(result).toEqual(row);
    expect(db.jobEvent.create).toHaveBeenCalledOnce();
  });

  it("returns the existing event on P2002 unique-constraint violation", async () => {
    const { Prisma } = await import("@aviary/db");
    const now = new Date();
    const existing = { jobId: "j1", seq: 1, eventType: "log", payload: {}, emittedAt: now };
    const dup = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
    });

    const db = {
      jobEvent: {
        create: vi.fn().mockRejectedValue(dup),
        findUnique: vi.fn().mockResolvedValue(existing),
      },
    } as unknown as Parameters<typeof appendJobEvent>[0];

    const result = await appendJobEvent(db, {
      jobId: "j1",
      seq: 1,
      eventType: "log",
      payload: {},
      emittedAt: now,
    });

    expect(result).toEqual(existing);
    expect(db.jobEvent.findUnique).toHaveBeenCalledOnce();
  });

  it("re-throws errors that are not P2002", async () => {
    const db = {
      jobEvent: {
        create: vi.fn().mockRejectedValue(new Error("connection lost")),
      },
    } as unknown as Parameters<typeof appendJobEvent>[0];

    await expect(
      appendJobEvent(db, {
        jobId: "j1",
        seq: 1,
        eventType: "log",
        payload: {},
        emittedAt: new Date(),
      })
    ).rejects.toThrow("connection lost");
  });
});

// ── listJobEventsAfter ───────────────────────────────────────────────────────

describe("listJobEventsAfter", () => {
  it("returns mapped events ordered by seq", async () => {
    const now = new Date();
    const rows = [
      { jobId: "j1", seq: 2, eventType: "log", payload: {}, emittedAt: now },
      { jobId: "j1", seq: 3, eventType: "done", payload: { code: 0 }, emittedAt: now },
    ];
    const db = {
      jobEvent: { findMany: vi.fn().mockResolvedValue(rows) },
    } as unknown as Parameters<typeof listJobEventsAfter>[0];

    const result = await listJobEventsAfter(db, { jobId: "j1", afterSeq: 1 });

    expect(result).toHaveLength(2);
    expect(result[0].seq).toBe(2);
    expect(result[1].seq).toBe(3);
    expect(db.jobEvent.findMany).toHaveBeenCalledWith({
      where: { jobId: "j1", seq: { gt: 1 } },
      orderBy: { seq: "asc" },
      take: 500,
    });
  });

  it("uses a custom limit when provided", async () => {
    const db = {
      jobEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof listJobEventsAfter>[0];

    await listJobEventsAfter(db, { jobId: "j1", afterSeq: 0, limit: 10 });

    expect(db.jobEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("returns empty array when no events are found", async () => {
    const db = {
      jobEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof listJobEventsAfter>[0];

    const result = await listJobEventsAfter(db, { jobId: "j1", afterSeq: 99 });
    expect(result).toEqual([]);
  });
});
