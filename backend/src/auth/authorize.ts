// Role guard (auth plan Phase 1, deliverable 9; CLAUDE §5).
//
// Mount after `authenticate`. Blocks any request whose DB-resolved role is not in the allow-list, so
// a member can never reach lead/admin surfaces. This is the foundation guard consumed by the Teams,
// Dashboard, and Insights modules; auth's own endpoints don't gate by role.
import type { NextFunction, Request, Response } from "express";
import type { Role } from "../generated/prisma/client";
import { AppError } from "../shared/httpError";

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication required."));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "FORBIDDEN", "You do not have access to this resource."));
      return;
    }
    next();
  };
}
