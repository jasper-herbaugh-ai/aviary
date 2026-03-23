import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/[\s=]/g, "");
  if (!normalized) {
    throw new Error("TOTP secret is empty");
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("TOTP secret contains invalid base32 characters");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits = DEFAULT_DIGITS): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const lastByte = digest.at(-1);
  if (lastByte === undefined) {
    throw new Error("Unable to calculate TOTP hash");
  }

  const offset = lastByte & 0x0f;
  const p0 = digest[offset];
  const p1 = digest[offset + 1];
  const p2 = digest[offset + 2];
  const p3 = digest[offset + 3];
  if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) {
    throw new Error("Unable to calculate TOTP hash");
  }

  const binary =
    ((p0 & 0x7f) << 24) |
    ((p1 & 0xff) << 16) |
    ((p2 & 0xff) << 8) |
    (p3 & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "");
}

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function buildTotpOtpauthUrl(options: {
  issuer: string;
  accountName: string;
  secret: string;
  periodSeconds?: number;
  digits?: number;
}): string {
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const label = `${options.issuer}:${options.accountName}`;

  const url = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  url.searchParams.set("secret", options.secret);
  url.searchParams.set("issuer", options.issuer);
  url.searchParams.set("algorithm", "SHA1");
  url.searchParams.set("digits", `${digits}`);
  url.searchParams.set("period", `${periodSeconds}`);
  return url.toString();
}

export function verifyTotpCode(options: {
  secret: string;
  code: string;
  window?: number;
  periodSeconds?: number;
  digits?: number;
  now?: Date;
}): boolean {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const window = options.window ?? 1;
  const normalizedCode = normalizeCode(options.code);

  if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) {
    return false;
  }

  const secret = base32Decode(options.secret);
  const nowSeconds = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const currentCounter = Math.floor(nowSeconds / periodSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    if (hotp(secret, counter, digits) === normalizedCode) {
      return true;
    }
  }

  return false;
}
