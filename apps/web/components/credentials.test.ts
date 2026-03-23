import { describe, expect, it } from "vitest";
import { readSecretFromFile, secretPlaceholder } from "./credentials.js";

describe("credential helpers", () => {
  it("returns private key placeholder for ssh keys", () => {
    expect(secretPlaceholder("ssh_key")).toBe("Paste private key");
  });

  it("returns password placeholder for password credentials", () => {
    expect(secretPlaceholder("password")).toBe("Enter password");
  });

  it("reads uploaded secret content", async () => {
    const secret = await readSecretFromFile({
      text: async () => "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
    });

    expect(secret).toContain("BEGIN PRIVATE KEY");
  });

  it("rejects empty uploaded files", async () => {
    await expect(
      readSecretFromFile({
        text: async () => "   \n"
      })
    ).rejects.toThrow("Selected file is empty.");
  });
});
