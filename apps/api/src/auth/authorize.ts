
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
