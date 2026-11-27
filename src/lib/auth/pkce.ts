import { createHash, randomBytes } from "node:crypto";

/** PKCE (RFC 7636) S256 pair. verifier: 32 random bytes → 43 base64url chars. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** OAuth state: 32 random bytes, base64url. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}
