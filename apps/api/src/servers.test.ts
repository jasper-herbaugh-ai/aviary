import { describe, expect, it } from "vitest";
import { toSafeServer } from "./servers.js";

describe("toSafeServer", () => {
  it("maps linked credential details onto server response", () => {
    const server = {
      id: "server-1",
      hostname: "web-1",
      ipAddress: "10.0.0.5",
      port: 22,
      username: "ubuntu",
      displayName: "Web 1",
      osType: "ubuntu",
      tags: ["prod", "web"],
      active: true,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T01:00:00.000Z"),
      credentials: [
        {
          credentialId: "cred-1",
          credential: {
            name: "prod ssh"
          }
        }
      ]
    };

    const result = toSafeServer(server);

    expect(result.credentialId).toBe("cred-1");
    expect(result.credentialName).toBe("prod ssh");
    expect("credentials" in result).toBe(false);
  });

  it("returns null credential fields when no credential link exists", () => {
    const server = {
      id: "server-1",
      hostname: "web-1",
      ipAddress: "10.0.0.5",
      port: 22,
      username: null,
      displayName: "Web 1",
      osType: null,
      tags: [],
      active: true,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T01:00:00.000Z"),
      credentials: []
    };

    const result = toSafeServer(server);

    expect(result.credentialId).toBeNull();
    expect(result.credentialName).toBeNull();
  });
});
