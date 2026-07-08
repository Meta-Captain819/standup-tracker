export const ROLES = ["OWNER_ADMIN", "LEAD", "MEMBER"] as const;

export type Role = (typeof ROLES)[number];
