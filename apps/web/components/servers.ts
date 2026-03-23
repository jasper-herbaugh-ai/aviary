export function parseServerTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatServerUsername(username: string | null): string {
  return username || "Uses credential username";
}
