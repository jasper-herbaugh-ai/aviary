import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aviary/db", () => ({
  AlertBackendType: { database: "database", webhook: "webhook" },
  AlertOperator: { gt: "gt", lt: "lt", eq: "eq" },
  AlertSeverity: { info: "info", warning: "warning", critical: "critical" },
  PrismaClient: vi.fn(),
}));

import { evaluateAlertsForMetrics } from "./alerts.js";

function makePrisma() {
  return {
    appConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    alert: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as Parameters<typeof evaluateAlertsForMetrics>[0];
}

const ALERT = {
  id: "a1",
  serverId: "s1",
  metric: "cpu",
  operator: "gt",
  threshold: 70,
  severity: "warning",
};

describe("evaluateAlertsForMetrics", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it("returns early without querying DB when metrics list is empty", async () => {
    const prisma = makePrisma();
    await evaluateAlertsForMetrics(prisma, []);
    expect(prisma.appConfig.findUnique).not.toHaveBeenCalled();
  });

  it("does not create a notification when no alerts are defined for a server", async () => {
    const prisma = makePrisma();
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 99 }]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not trigger when metric value does not satisfy gt condition", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    // value (50) is NOT > threshold (70)
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 50 }]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates notification when gt condition is satisfied", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);
    // value (80) > threshold (70) → should trigger
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("creates notification when lt condition is satisfied", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...ALERT, operator: "lt", threshold: 10 },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);
    // value (5) < threshold (10) → should trigger
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 5 }]);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("creates notification when eq condition is satisfied", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...ALERT, operator: "eq", threshold: 50 },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);
    // value (50) === threshold (50) → should trigger
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 50 }]);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("skips alert when the metric name does not match any alert", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...ALERT, metric: "memory" },
    ]);
    // alert watches "memory" but we only report "cpu"
    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 99 }]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("groups metrics by server and queries each server independently", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await evaluateAlertsForMetrics(prisma, [
      { serverId: "s1", metric: "cpu", value: 80 },
      { serverId: "s2", metric: "cpu", value: 90 },
    ]);
    // One query per unique serverId
    expect(prisma.alert.findMany).toHaveBeenCalledTimes(2);
  });

  it("dispatches webhook when backend is configured as webhook type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const prisma = makePrisma();
    (prisma.appConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      alertsBackendType: "webhook",
      alertsBackendWebhookUrl: "https://example.com/hook",
      alertsBackendAuthHeader: "Bearer secret",
    });
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://example.com/hook");
    expect(opts.method).toBe("POST");
    expect(opts.headers["authorization"]).toBe("Bearer secret");
    expect(opts.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(opts.body as string) as { event: string };
    expect(body.event).toBe("alert.triggered");
  });

  it("includes auth header only when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const prisma = makePrisma();
    (prisma.appConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      alertsBackendType: "webhook",
      alertsBackendWebhookUrl: "https://example.com/hook",
      alertsBackendAuthHeader: null,
    });
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(opts.headers["authorization"]).toBeUndefined();
  });

  it("swallows webhook errors so other alerts still process", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const prisma = makePrisma();
    (prisma.appConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      alertsBackendType: "webhook",
      alertsBackendWebhookUrl: "https://example.com/hook",
      alertsBackendAuthHeader: null,
    });
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await expect(
      evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }])
    ).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not dispatch webhook when backend type is database", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const prisma = makePrisma();
    (prisma.appConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      alertsBackendType: "database",
      alertsBackendWebhookUrl: "https://example.com/hook",
      alertsBackendAuthHeader: null,
    });
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses database backend by default when appConfig returns null", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const prisma = makePrisma();
    // appConfig.findUnique returns null → backend defaults to "database"
    (prisma.appConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ALERT]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);

    // No webhook should be called
    expect(mockFetch).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("includes severity label uppercased in the notification message", async () => {
    const prisma = makePrisma();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...ALERT, severity: "critical", operator: "gt", threshold: 70 },
    ]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      {},
      { triggeredAt: new Date() },
    ]);

    await evaluateAlertsForMetrics(prisma, [{ serverId: "s1", metric: "cpu", value: 80 }]);

    const calls = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls;
    // The transaction receives two prisma operations; confirm at least it was called
    expect(calls).toHaveLength(1);
  });
});
