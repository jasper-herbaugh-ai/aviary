import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, getKey, sha256 } from "./crypto.js";

describe("getKey", () => {
  it("returns a buffer from a 64-char hex string", () => {
    const hex = "a".repeat(64);
    const key = getKey(hex);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("returns a buffer from a 32-byte UTF-8 string directly", () => {
    const raw = "12345678901234567890123456789012"; // 32 bytes
    const key = getKey(raw);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("hashes an arbitrary string to 32 bytes via SHA-256", () => {
    const key = getKey("short");
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });
});

describe("encryptSecret / decryptSecret", () => {
  const key = getKey("test-key-32-bytes-padding-paddinx");

  it("round-trips a plaintext value", () => {
    const plain = "super-secret-password-123";
    const encrypted = encryptSecret(plain, key);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(":")).toHaveLength(3);
    const decrypted = decryptSecret(encrypted, key);
    expect(decrypted).toBe(plain);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const plain = "same-input";
    const a = encryptSecret(plain, key);
    const b = encryptSecret(plain, key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe(plain);
    expect(decryptSecret(b, key)).toBe(plain);
  });

  it("throws on tampered ciphertext", () => {
    const plain = "secret";
    const enc = encryptSecret(plain, key);
    const parts = enc.split(":");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });

  it("throws on invalid payload format", () => {
    expect(() => decryptSecret("not:valid", key)).toThrow("Invalid encrypted payload");
  });
});

describe("sha256", () => {
  it("returns a 64-char hex digest", () => {
    const hash = sha256("hello");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});
