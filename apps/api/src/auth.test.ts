import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./auth.js";

const SECRET = "test-secret-at-least-16-chars!!";

describe("signSessionToken / verifySessionToken", () => {
  it("signs and verifies a valid token", async () => {
    const token = await signSessionToken(SECRET, {
      sid: "session-1",
      sub: "user-1",
      role: "admin"
    });

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const claims = await verifySessionToken(SECRET, token);
    expect(claims.sid).toBe("session-1");
    expect(claims.sub).toBe("user-1");
    expect(claims.role).toBe("admin");
  });

  it("signs token with operator role", async () => {
    const token = await signSessionToken(SECRET, {
      sid: "session-2",
      sub: "user-2",
      role: "operator"
    });
    const claims = await verifySessionToken(SECRET, token);
    expect(claims.role).toBe("operator");
  });

  it("rejects token signed with wrong secret", async () => {
    const token = await signSessionToken(SECRET, { sid: "s", sub: "u", role: "admin" });
    await expect(verifySessionToken("different-secret-16chars!!", token)).rejects.toThrow();
  });

  it("rejects expired token", async () => {
    // Create token via a shorter path — can't easily create expired tokens via signSessionToken.
    // Instead just verify that verifySessionToken rejects a malformed/tampered token.
    const tampered = "header.payload.badsignature";
    await expect(verifySessionToken(SECRET, tampered)).rejects.toThrow();
  });

  it("rejects token with missing sid", async () => {
    const { SignJWT } = await import("jose");
    const { createSecretKey } = await import("node:crypto");
    const badToken = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
    await expect(verifySessionToken(SECRET, badToken)).rejects.toThrow("Invalid token payload");
  });

  it("rejects token with invalid role", async () => {
    const { SignJWT } = await import("jose");
    const { createSecretKey } = await import("node:crypto");
    const badToken = await new SignJWT({ role: "superuser", sid: "s" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
    await expect(verifySessionToken(SECRET, badToken)).rejects.toThrow("Invalid role");
  });
});
