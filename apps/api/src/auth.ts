import { createSecretKey } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export type SessionClaims = {
  sid: string;
  sub: string;
  role: "admin" | "operator";
};

export async function signSessionToken(secret: string, claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(claims.sub)
    .setExpirationTime("12h")
    .sign(createSecretKey(Buffer.from(secret, "utf8")));
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionClaims> {
  const result = await jwtVerify(token, createSecretKey(Buffer.from(secret, "utf8")), {
    algorithms: ["HS256"]
  });

  const sid = result.payload.sid;
  const sub = result.payload.sub;
  const role = result.payload.role;

  if (typeof sid !== "string" || typeof sub !== "string") {
    throw new Error("Invalid token payload");
  }

  if (role !== "admin" && role !== "operator") {
    throw new Error("Invalid role");
  }

  return { sid, sub, role };
}
