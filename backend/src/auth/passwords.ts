// Password hashing (auth plan Phase 1, deliverable 5; CLAUDE §5).
//
// Argon2id only. A hash is never logged or returned; verification never leaks whether the stored
// hash was malformed vs. simply wrong — both surface as a plain `false` to the caller.
import argon2 from "argon2";

const HASH_OPTIONS: argon2.Options = { type: argon2.argon2id };

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A corrupt/unreadable hash must fail closed, not throw into the auth flow.
    return false;
  }
}
