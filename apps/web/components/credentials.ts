type SecretFile = {
  text: () => Promise<string>;
};

export function secretPlaceholder(type: "ssh_key" | "password"): string {
  return type === "ssh_key" ? "Paste private key" : "Enter password";
}

export async function readSecretFromFile(file: SecretFile): Promise<string> {
  const contents = await file.text();
  if (!contents.trim()) {
    throw new Error("Selected file is empty.");
  }
  return contents;
}
