

import { prisma } from "../db/prisma";

export { prisma };

const TEAM_SCOPED_MODELS = new Set<string>([
  "User",
  "Standup",
  "OnboardingToken",
  "SessionRefreshToken",
  "AiSummary",
  "Notification",
]);

type OperationArgs = Record<string, unknown>;

function withWhere(args: OperationArgs | undefined, field: string, value: string): OperationArgs {
  const base = args ?? {};
  const where = (base.where as Record<string, unknown> | undefined) ?? {};
  return { ...base, where: { ...where, [field]: value } };
}

function withTeamData(args: OperationArgs | undefined, teamId: string): OperationArgs {
  const base = args ?? {};
  const data = base.data;
  if (Array.isArray(data)) {
    return { ...base, data: data.map((row) => ({ ...(row as object), teamId })) };
  }
  return { ...base, data: { ...((data as object | undefined) ?? {}), teamId } };
}

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
