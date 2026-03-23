import { describe, expect, it } from "vitest";
import { intervalToCron, wizardAutomationInputSchema } from "./wizard.js";

describe("intervalToCron", () => {
  it("converts second schedules to cron", () => {
    expect(intervalToCron({ every: 15, unit: "seconds" })).toBe("*/15 * * * * *");
    expect(intervalToCron({ every: 1, unit: "seconds" })).toBe("* * * * * *");
  });

  it("converts minute schedules to cron", () => {
    expect(intervalToCron({ every: 5, unit: "minutes" })).toBe("0 */5 * * * *");
    expect(intervalToCron({ every: 1, unit: "minutes" })).toBe("0 * * * * *");
  });

  it("converts hour schedules to cron", () => {
    expect(intervalToCron({ every: 2, unit: "hours" })).toBe("0 0 */2 * * *");
  });

  it("converts day schedules to cron", () => {
    expect(intervalToCron({ every: 3, unit: "days" })).toBe("0 0 0 */3 * *");
  });

  it("converts week schedules to cron by day interval", () => {
    expect(intervalToCron({ every: 2, unit: "weeks" })).toBe("0 0 0 */14 * *");
  });

  it("converts month schedules to cron", () => {
    expect(intervalToCron({ every: 4, unit: "months" })).toBe("0 0 0 1 */4 *");
  });

  it("rejects invalid intervals", () => {
    expect(() => intervalToCron({ every: 0, unit: "minutes" })).toThrow("positive integer");
    expect(() => intervalToCron({ every: 60, unit: "minutes" })).toThrow("Maximum interval for minutes is 59");
    expect(() => intervalToCron({ every: 5, unit: "weeks" })).toThrow("Maximum interval for weeks is 4");
  });
});

describe("wizardAutomationInputSchema", () => {
  const baseSchedule = {
    every: 5,
    unit: "minutes",
    enabled: true
  } as const;

  it("accepts existing credential and existing server selections", () => {
    const parsed = wizardAutomationInputSchema.parse({
      credential: {
        mode: "existing",
        id: "11111111-1111-4111-8111-111111111111"
      },
      server: {
        mode: "existing",
        id: "22222222-2222-4222-8222-222222222222"
      },
      playbookId: "33333333-3333-4333-8333-333333333333",
      schedule: baseSchedule
    });

    expect(parsed.credential.mode).toBe("existing");
    expect(parsed.server.mode).toBe("existing");
  });

  it("accepts new credential and new server payloads", () => {
    const parsed = wizardAutomationInputSchema.parse({
      credential: {
        mode: "new",
        name: "Prod SSH Key",
        type: "ssh_key",
        username: "ubuntu",
        secretValue: "secret"
      },
      server: {
        mode: "new",
        displayName: "Prod API",
        hostname: "api.prod.internal",
        ipAddress: "10.0.0.10",
        port: 22,
        username: "ubuntu",
        osType: "ubuntu",
        tags: ["prod", "api"],
        active: true
      },
      playbookId: "33333333-3333-4333-8333-333333333333",
      schedule: baseSchedule
    });

    expect(parsed.credential.mode).toBe("new");
    expect(parsed.server.mode).toBe("new");
  });
});
