import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventEmitter } from "node:events";

// ── Module mocks (hoisted so they apply before imports) ───────────────────────

const { mockServer, mockBindAsync, mockTryShutdown } = vi.hoisted(() => {
  const mockBindAsync = vi.fn();
  const mockTryShutdown = vi.fn();
  const mockServer = {
    addService: vi.fn(),
    bindAsync: mockBindAsync,
    start: vi.fn(),
    tryShutdown: mockTryShutdown,
    forceShutdown: vi.fn(),
  };
  return { mockServer, mockBindAsync, mockTryShutdown };
});

vi.mock("@grpc/grpc-js", () => ({
  Server: vi.fn(() => mockServer),
  ServerCredentials: { createInsecure: vi.fn(() => ({})) },
  status: { UNAUTHENTICATED: 16, INTERNAL: 13 },
  loadPackageDefinition: vi.fn(() => ({
    aviary: {
      jobs: {
        v1: {
          JobEventIngress: { service: {} },
        },
      },
    },
  })),
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock("@aviary/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, meta: { code: string }) {
        super(msg);
        this.code = meta.code;
      }
    },
  },
  PrismaClient: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { startJobEventGrpcServer } from "./job-events-grpc.js";
import { JobEventBroker } from "./job-events.js";

type GrpcCallback = (err: unknown, result: unknown) => void;

type MockCall = {
  metadata: { get: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  _emit: (event: string, data?: unknown) => Promise<void>;
};

/** Build a fake ServerReadableStream and a way to push events into it. */
function makeCall(token: string | null): MockCall {
  const handlers: Record<string, ((data?: unknown) => void)[]> = {};

  const on = vi.fn((event: string, handler: (data?: unknown) => void) => {
    handlers[event] = handlers[event] ?? [];
    handlers[event].push(handler);
  });

  const metadata = {
    get: vi.fn((key: string) => {
      if (key === "x-internal-token" && token !== null) return [token];
      return [];
    }),
  };

  const _emit = async (event: string, data?: unknown) => {
    for (const h of handlers[event] ?? []) {
      await h(data);
    }
  };

  return { metadata, on, _emit };
}

function makeOptions(overrides: Partial<Parameters<typeof startJobEventGrpcServer>[0]> = {}) {
  const broker = new JobEventBroker();
  const db = {
    job: { findUnique: vi.fn().mockResolvedValue({ id: "job-1" }) },
    jobEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    db: db as unknown as Parameters<typeof startJobEventGrpcServer>[0]["db"],
    broker,
    internalToken: "secret-tok",
    port: 50051,
    logger,
    ...overrides,
  };
}

/** Extract the publishEvents handler captured via server.addService */
function getCapturedHandler(): (call: MockCall, callback: GrpcCallback) => void {
  const addServiceCalls = mockServer.addService.mock.calls;
  expect(addServiceCalls).toHaveLength(1);
  const impl = addServiceCalls.at(0)![1] as Record<string, unknown>;
  return impl.publishEvents as (call: MockCall, cb: GrpcCallback) => void;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("startJobEventGrpcServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBindAsync.mockImplementation(
      (_addr: string, _creds: unknown, cb: (err: null | Error) => void) => cb(null)
    );
    mockTryShutdown.mockImplementation((cb: (err?: Error) => void) => cb());
  });

  it("starts the server and resolves to an object with a close() method", async () => {
    const opts = makeOptions();
    const handle = await startJobEventGrpcServer(opts);
    expect(handle).toHaveProperty("close");
    expect(typeof handle.close).toBe("function");
    expect(mockServer.bindAsync).toHaveBeenCalledOnce();
    expect(mockServer.start).toHaveBeenCalledOnce();
  });

  it("binds to the configured port", async () => {
    const opts = makeOptions({ port: 9999 });
    await startJobEventGrpcServer(opts);
    expect(mockServer.bindAsync).toHaveBeenCalledWith(
      "0.0.0.0:9999",
      expect.anything(),
      expect.any(Function)
    );
  });

  it("rejects the promise when bind fails", async () => {
    mockBindAsync.mockImplementation(
      (_addr: string, _creds: unknown, cb: (err: Error) => void) =>
        cb(new Error("address in use"))
    );
    const opts = makeOptions();
    await expect(startJobEventGrpcServer(opts)).rejects.toThrow("address in use");
  });

  it("close() shuts down the server gracefully", async () => {
    const opts = makeOptions();
    const handle = await startJobEventGrpcServer(opts);
    await handle.close();
    expect(mockServer.tryShutdown).toHaveBeenCalledOnce();
  });

  it("close() forces shutdown when tryShutdown returns an error", async () => {
    mockTryShutdown.mockImplementation((cb: (err?: Error) => void) =>
      cb(new Error("timeout"))
    );
    const opts = makeOptions();
    const handle = await startJobEventGrpcServer(opts);
    await handle.close();
    expect(mockServer.forceShutdown).toHaveBeenCalledOnce();
  });

  it("rejects the call with UNAUTHENTICATED when the token is wrong", async () => {
    const opts = makeOptions();
    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("wrong-token");
    const callback = vi.fn();

    handler(call, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 16 }),
      null
    );
  });

  it("rejects the call with UNAUTHENTICATED when no token is provided", async () => {
    const opts = makeOptions();
    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall(null);
    const callback = vi.fn();

    handler(call, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 16 }),
      null
    );
  });

  it("accepts valid events and calls back with acceptedCount", async () => {
    const opts = makeOptions();
    // db.jobEvent.create returns the persisted event
    (opts.db.jobEvent as unknown as { create: ReturnType<typeof vi.fn> }).create =
      vi.fn().mockResolvedValue({
        jobId: "job-1",
        seq: 1,
        eventType: "log",
        payload: {},
        emittedAt: new Date(),
      });

    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", {
      jobId: "job-1",
      seq: 1,
      eventType: "log",
      payloadJson: "{}",
      emittedAt: new Date().toISOString(),
    });

    await call._emit("end");
    // Wait for pending promise chain
    await new Promise((r) => setTimeout(r, 0));

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ acceptedCount: 1, rejectedCount: 0 })
    );
  });

  it("rejects events with missing required fields (no jobId)", async () => {
    const opts = makeOptions();
    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", { jobId: "", seq: 1, eventType: "log" });
    await call._emit("end");
    await new Promise((r) => setTimeout(r, 0));

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ rejectedCount: 1, acceptedCount: 0 })
    );
    expect(opts.logger.warn).toHaveBeenCalled();
  });

  it("rejects events with invalid seq (zero is not allowed)", async () => {
    const opts = makeOptions();
    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", { jobId: "job-1", seq: 0, eventType: "log" });
    await call._emit("end");
    await new Promise((r) => setTimeout(r, 0));

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ rejectedCount: 1 })
    );
  });

  it("rejects events when the referenced job does not exist in the DB", async () => {
    const opts = makeOptions();
    (opts.db.job as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique =
      vi.fn().mockResolvedValue(null);

    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", { jobId: "ghost-job", seq: 1, eventType: "log" });
    await call._emit("end");
    await new Promise((r) => setTimeout(r, 0));

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ rejectedCount: 1, acceptedCount: 0 })
    );
  });

  it("caches known jobs so the DB is only queried once per jobId", async () => {
    const opts = makeOptions();
    (opts.db.jobEvent as unknown as { create: ReturnType<typeof vi.fn> }).create =
      vi.fn().mockResolvedValue({
        jobId: "job-1",
        seq: 1,
        eventType: "log",
        payload: {},
        emittedAt: new Date(),
      });

    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", { jobId: "job-1", seq: 1, eventType: "log" });
    (opts.db.jobEvent as unknown as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
      jobId: "job-1",
      seq: 2,
      eventType: "log",
      payload: {},
      emittedAt: new Date(),
    });
    await call._emit("data", { jobId: "job-1", seq: 2, eventType: "log" });
    await call._emit("end");
    await new Promise((r) => setTimeout(r, 0));

    // job.findUnique called only once despite two events for same jobId
    expect(
      (opts.db.job as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique
    ).toHaveBeenCalledOnce();
  });

  it("logs and increments rejectedCount on persistence errors", async () => {
    const opts = makeOptions();
    (opts.db.jobEvent as unknown as { create: ReturnType<typeof vi.fn> }).create =
      vi.fn().mockRejectedValue(new Error("DB down"));

    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);

    await call._emit("data", { jobId: "job-1", seq: 1, eventType: "log" });
    await call._emit("end");
    await new Promise((r) => setTimeout(r, 0));

    expect(opts.logger.error).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ rejectedCount: 1 })
    );
  });

  it("logs a warning on stream error events", async () => {
    const opts = makeOptions();
    await startJobEventGrpcServer(opts);

    const handler = getCapturedHandler();
    const call = makeCall("secret-tok");
    const callback = vi.fn();

    handler(call, callback);
    await call._emit("error", new Error("stream reset"));

    expect(opts.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      expect.stringContaining("stream closed")
    );
  });
});
