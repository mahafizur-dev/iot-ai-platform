import { createHash } from "node:crypto";

/** Refresh tokens are opaque to storage: only this hash is ever persisted. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
