import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import type { OrgContext } from "./context.js";

export async function logActivity(
  ctx: OrgContext,
  action: string,
  opts?: {
    projectId?: string | null;
    agentRole?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        projectId: opts?.projectId ?? null,
        agentRole: opts?.agentRole ?? null,
        action,
        metadata: (opts?.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  } catch {
    // Activity logging should never break the main flow
  }
}
