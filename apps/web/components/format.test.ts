import { describe, expect, it } from "vitest";
import { countWithLabel, formatCompactDate, formatDateTime } from "./format.js";

describe("formatDateTime", () => {
  it("returns n/a for null", () => {
    expect(formatDateTime(null)).toBe("n/a");
  });

  it("returns n/a for undefined", () => {
    expect(formatDateTime(undefined)).toBe("n/a");
  });

  it("returns n/a for invalid date string", () => {
    expect(formatDateTime("not-a-date")).toBe("n/a");
  });

  it("returns a formatted date string for a valid ISO date", () => {
    const result = formatDateTime("2026-01-15T10:30:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("n/a");
  });
});

describe("formatCompactDate", () => {
  it("returns n/a for null", () => {
    expect(formatCompactDate(null)).toBe("n/a");
  });

  it("returns n/a for undefined", () => {
    expect(formatCompactDate(undefined)).toBe("n/a");
  });

  it("returns n/a for invalid date", () => {
    expect(formatCompactDate("garbage")).toBe("n/a");
  });

  it("returns a compact formatted string for a valid date", () => {
    const result = formatCompactDate("2026-06-01T14:00:00Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("n/a");
  });
});

describe("countWithLabel", () => {
  it("uses singular form for count of 1", () => {
    expect(countWithLabel(1, "server", "servers")).toBe("1 server");
  });

  it("uses plural form for count of 0", () => {
    expect(countWithLabel(0, "server", "servers")).toBe("0 servers");
  });

  it("uses plural form for count > 1", () => {
    expect(countWithLabel(5, "alert", "alerts")).toBe("5 alerts");
  });
});
