
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import type { Role } from "../generated/prisma/client";
import { AppError } from "../shared/httpError";
import { verifyAccessToken } from "./tokens";

export interface AuthContext {
  userId: string;
  teamId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new AppError(401, "UNAUTHENTICATED", "Missing or malformed Authorization header.");
    }

    let userId: string;
    try {
      ({ userId } = verifyAccessToken(header.slice(BEARER_PREFIX.length).trim()));
    } catch {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired access token.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, teamId: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, "UNAUTHENTICATED", "Your account is not active.");
    }

    req.auth = { userId: user.id, teamId: user.teamId, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
