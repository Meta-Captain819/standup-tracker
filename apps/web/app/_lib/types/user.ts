import type { Role } from "@/app/_lib/types/role";

/** Mirrors Express's `userPublicSelect` shape (backend/src/identity). */
export interface PublicUser {
  id: string;
  teamId: string;
  email: string;
  name: string;
  role: Role;
}

/** Mirrors Express's signup/login response body. */
export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

/** Mirrors Express's `GET /auth/me` response body. */
export interface MeResponse {
  userId: string;
  teamId: string;
  role: Role;
  name: string;
  email: string;
}
