import { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";
import type { OrgContext } from "./context.js";

declare global {
  namespace Express {
    interface Request {
      orgContext?: OrgContext;
    }
  }
}

/**
 * Resolves an API key (or legacy token) to an OrgContext.
 * - Bearer token → look up ApiKey table → org + optional user
 * - Fallback: legacy API_SECRET_TOKEN → default org
 * - Dev mode (no API_SECRET_TOKEN set): default org, no auth required
 */
export async function mcpAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token) {
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: token },
      include: { organization: true, user: true },
    });

    if (apiKey) {
      prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {});

      req.orgContext = {
        organizationId: apiKey.organizationId,
        organizationSlug: apiKey.organization.slug,
        userId: apiKey.userId,
        userName: apiKey.user?.name ?? null,
      };
      return next();
    }

    const legacyToken = process.env.API_SECRET_TOKEN;
    if (legacyToken && token === legacyToken) {
      const ctx = await getDefaultOrgContext();
      if (ctx) {
        req.orgContext = ctx;
        return next();
      }
    }

    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid API key" },
      id: null,
    });
    return;
  }

  if (!process.env.API_SECRET_TOKEN) {
    const ctx = await getDefaultOrgContext();
    if (ctx) {
      req.orgContext = ctx;
      return next();
    }
  }

  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Unauthorized" },
    id: null,
  });
}

async function getDefaultOrgContext(): Promise<OrgContext | null> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!org) return null;
  return {
    organizationId: org.id,
    organizationSlug: org.slug,
    userId: null,
    userName: null,
  };
}
