import { afterEach, describe, expect, it } from "vitest";
import { getAuthToken, getStoredToken } from "./auth.js";

// In node environment (tests), window is undefined so localStorage functions
// return null/no-op. We test the branch behavior and the env var fallback.

describe("getStoredToken (node env — no window)", () => {
  it("returns null when window is not available", () => {
    expect(getStoredToken()).toBeNull();
  });
});

describe("getAuthToken", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DEV_TOKEN;
  });

  it("returns null when no token stored and no dev env var", () => {
    expect(getAuthToken()).toBeNull();
  });

  it("returns NEXT_PUBLIC_DEV_TOKEN when set (dev-mode shortcut)", () => {
    process.env.NEXT_PUBLIC_DEV_TOKEN = "dev-token-abc";
    expect(getAuthToken()).toBe("dev-token-abc");
  });
});
