import { describe, expect, it } from "vitest";
import { formatServerUsername, parseServerTags } from "./servers.js";

describe("server helpers", () => {
  it("parses comma-separated tags and removes blanks", () => {
    expect(parseServerTags("prod, web , , critical")).toEqual(["prod", "web", "critical"]);
  });

  it("uses fallback label when server username is not set", () => {
    expect(formatServerUsername(null)).toBe("Uses credential username");
  });

  it("returns explicit server username when present", () => {
    expect(formatServerUsername("ec2-user")).toBe("ec2-user");
  });
});
