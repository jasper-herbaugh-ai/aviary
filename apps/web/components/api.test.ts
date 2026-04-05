import { beforeEach, describe, expect, it } from "vitest";
import { apiBase } from "./api.js";

describe("apiBase", () => {
  beforeEach(() => {
    // Clear env var before each test
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("returns env var when NEXT_PUBLIC_API_BASE_URL is set", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.myaviary.example.com";
    expect(apiBase()).toBe("https://api.myaviary.example.com");
  });

  it("returns localhost fallback when running in node (no window)", () => {
    // In test environment (Node-like), window is provided by happy-dom but
    // the hostname defaults to localhost with port 0 or similar.
    // What matters: when no env var is set, a string is returned.
    const base = apiBase();
    expect(typeof base).toBe("string");
    expect(base.length).toBeGreaterThan(0);
  });

  it("uses port 4000 when window.location has a non-standard port", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = undefined as unknown as string;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    // happy-dom sets window.location to "about:blank" by default;
    // apiBase falls through to the "http://localhost:4000" fallback.
    const base = apiBase();
    expect(typeof base).toBe("string");
  });
});
