// Tenant-scoping data-access wrapper — the single choke point for all team-owned reads and writes.
//
// CLAUDE §2.2/§4 and the database plan require that no query touching team data runs without the
// caller's teamId applied at the data-access layer. `forTeam(teamId)` returns a Prisma client whose
// every operation on a tenant-owned model is transparently scoped to that team:
//
//   • teamId-bearing models (User, Standup, OnboardingToken, SessionRefreshToken, AiSummary,
//     Notification) get `teamId` injected into every `where` filter and into `data` on
//     create/upsert. Reads, updates, and deletes of another team's row therefore return nothing (or
//     raise P2025) — cross-team access is impossible through this client.
//   • Team itself is pinned to `id = teamId`; creating or deleting a Team never goes through this
//     client (team lifecycle is a bootstrap concern, below).
//
// Handlers obtain their client from `forTeam(teamId)` and never call the base `prisma` client for
// team data. The base client is exported only for pre-auth identity/bootstrap lookups by a globally
// unique key (user by email, token by hash) and for the atomic signup transaction that creates a
// team together with its owner-admin.
//
// Caveat: raw queries ($queryRaw / $executeRaw) bypass client extensions — never use raw for team data.

import { prisma } from "../db/prisma";

export { prisma };

// Models that carry a `teamId` scalar and are scoped by equality on it.
const TEAM_SCOPED_MODELS = new Set<string>([
  "User",
  "Standup",
  "OnboardingToken",
  "SessionRefreshToken",
  "AiSummary",
  "Notification",
]);

type OperationArgs = Record<string, unknown>;

// Merge a `field = value` filter into `args.where`.
function withWhere(args: OperationArgs | undefined, field: string, value: string): OperationArgs {
  const base = args ?? {};
  const where = (base.where as Record<string, unknown> | undefined) ?? {};
  return { ...base, where: { ...where, [field]: value } };
}

// Stamp `teamId` onto `args.data` for create/createMany (single row or array).
function withTeamData(args: OperationArgs | undefined, teamId: string): OperationArgs {
  const base = args ?? {};
  const data = base.data;
  if (Array.isArray(data)) {
    return { ...base, data: data.map((row) => ({ ...(row as object), teamId })) };
  }
  return { ...base, data: { ...((data as object | undefined) ?? {}), teamId } };
}

// Scope an upsert: filter and create-payload both pinned to teamId (update needs none — the where
// already prevents touching another team's row).
function withTeamUpsert(args: OperationArgs | undefined, teamId: string): OperationArgs {
  const base = args ?? {};
  const where = (base.where as Record<string, unknown> | undefined) ?? {};
  const create = (base.create as object | undefined) ?? {};
  return { ...base, where: { ...where, teamId }, create: { ...create, teamId } };
}

/**
 * Returns a Prisma client scoped to `teamId`. Use the returned client for every team-owned read and
 * write; the scoping is enforced by a query extension and cannot be bypassed for tenant models.
 */
export function forTeam(teamId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (model === undefined || (model !== "Team" && !TEAM_SCOPED_MODELS.has(model))) {
            return query(args);
          }

          const a = args as OperationArgs | undefined;

          // Team is the tenant root: pin reads/updates to its own id; block lifecycle operations.
          if (model === "Team") {
            switch (operation) {
              case "create":
              case "createMany":
              case "createManyAndReturn":
              case "upsert":
              case "delete":
              case "deleteMany":
                throw new Error(
                  `Team.${operation} is not permitted through the tenant-scoped client`,
                );
              default:
                return query(withWhere(a, "id", teamId));
            }
          }

          switch (operation) {
            case "create":
            case "createMany":
            case "createManyAndReturn":
              return query(withTeamData(a, teamId));
            case "upsert":
              return query(withTeamUpsert(a, teamId));
            // find*/update*/delete*/count/aggregate/groupBy all accept a `where` — scope it by teamId.
            // Single-record ops (findUnique/update/delete) apply teamId as an extra filter, so a wrong
            // team yields no match rather than another team's row.
            default:
              return query(withWhere(a, "teamId", teamId));
          }
        },
      },
    },
  });
}

/** A team-scoped Prisma client, as returned by `forTeam`. */
export type TenantClient = ReturnType<typeof forTeam>;
