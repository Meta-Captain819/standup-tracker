import "server-only";
import { createHash } from "crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { env } from "@/app/_lib/env";
import { SESSION_MAX_AGE_SECONDS } from "@/app/_lib/session/constants";
import type { Role } from "@/app/_lib/types/role";

/**
 * The Express-issued access/refresh tokens live inside this cookie, not just a userId, so it is
 * encrypted (JWE, dir/A256GCM) rather than merely signed — confidentiality matters here, not just
 * tamper-evidence.
 */
export interface SessionPayload {
  userId: string;
  teamId: string;
  role: Role;
  name: string;
  email: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
}

// A256GCM direct encryption requires an exact 32-byte key; SESSION_SECRET is a passphrase of
// arbitrary length, so it's hashed down to a fixed-size key rather than truncated/padded by hand.
const encryptionKey = createHash("sha256").update(env.SESSION_SECRET).digest();

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .encrypt(encryptionKey);
}

export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(token, encryptionKey);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
