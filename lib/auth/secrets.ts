import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getEnv } from "@/lib/env";

const scrypt = promisify(scryptCallback) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export type SecretKind = "password" | "mpin";

/**
 * HMAC the secret with a server-side pepper before scrypt. A leaked database
 * alone is then not enough to brute-force a short MPIN offline.
 */
function prepare(kind: SecretKind, secret: string): Buffer {
  return createHmac("sha256", getEnv().AUTH_PEPPER)
    .update(`${kind}:${secret}`)
    .digest();
}

/** Returns `scrypt$N$r$p$<salt>$<hash>` (base64). */
export async function hashSecret(
  kind: SecretKind,
  secret: string,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(prepare(kind, secret), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifySecret(
  kind: SecretKind,
  secret: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const derived = await scrypt(
    prepare(kind, secret),
    Buffer.from(saltB64, "base64"),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p) },
  );
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same CPU as a real check when the username does not exist, so
 * response time does not reveal which usernames are registered.
 */
export async function verifyAgainstDummy(
  kind: SecretKind,
  secret: string,
): Promise<void> {
  dummyHash ??= hashSecret(kind, randomBytes(16).toString("hex"));
  await verifySecret(kind, secret, await dummyHash);
}
