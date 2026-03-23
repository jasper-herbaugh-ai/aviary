import { describe, expect, it } from "vitest";
import { createCredentialInputSchema, createServerInputSchema } from "./index.js";

describe("types schemas", () => {
  it("validates credential input", () => {
    const parsed = createCredentialInputSchema.parse({
      name: "root",
      type: "password",
      username: "root",
      secretValue: "secret"
    });

    expect(parsed.username).toBe("root");
  });

  it("validates server input with credential and username override", () => {
    const parsed = createServerInputSchema.parse({
      hostname: "web-1.example.internal",
      ipAddress: "10.0.0.5",
      port: 22,
      username: "ubuntu",
      displayName: "Web 1",
      osType: "ubuntu",
      tags: ["prod", "web"],
      active: true,
      credentialId: "11111111-1111-4111-8111-111111111111"
    });

    expect(parsed.username).toBe("ubuntu");
    expect(parsed.credentialId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects invalid credentialId values in server input", () => {
    expect(() =>
      createServerInputSchema.parse({
        hostname: "web-1.example.internal",
        ipAddress: "10.0.0.5",
        port: 22,
        username: null,
        displayName: "Web 1",
        osType: null,
        tags: [],
        active: true,
        credentialId: "not-a-uuid"
      })
    ).toThrow();
  });
});
