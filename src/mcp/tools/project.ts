import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { logActivity } from "../../activity.js";
import type { OrgContext } from "../../context.js";

export function registerProjectTools(server: McpServer, ctx: OrgContext) {
  server.registerTool("project_register", {
    description:
      "Register a new project so the team can track knowledge per project.",
    inputSchema: {
      name: z
        .string()
        .describe("Unique project name (e.g. fanzy, falak)"),
      stack: z
        .array(z.string())
        .describe("Tech stack tags (e.g. [nextjs, prisma, clerk])"),
      description: z
        .string()
        .optional()
        .describe("Brief project description"),
    },
  }, async ({ name, stack, description }) => {
    try {
      const existing = await prisma.project.findFirst({
        where: { name: name.toLowerCase(), organizationId: ctx.organizationId },
      });

      if (existing) {
        const updated = await prisma.project.update({
          where: { id: existing.id },
          data: { stack, description },
        });

        await logActivity(ctx, "project_update", {
          projectId: updated.id,
          metadata: { stack, description },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Updated project "${updated.name}" — stack: ${updated.stack.join(", ")}`,
            },
          ],
        };
      }

      const project = await prisma.project.create({
        data: {
          name: name.toLowerCase(),
          organizationId: ctx.organizationId,
          stack,
          description,
        },
      });

      if (ctx.userId) {
        await prisma.projectAssignment.create({
          data: {
            projectId: project.id,
            userId: ctx.userId,
            role: "lead",
          },
        });
      }

      await logActivity(ctx, "project_register", {
        projectId: project.id,
        metadata: { name: project.name, stack },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Registered project "${project.name}" — stack: ${project.stack.join(", ")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error registering project: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("project_get", {
    description:
      "Get a project's profile, stats, contributors, and summary of associated memories.",
    inputSchema: {
      name: z.string().describe("Project name"),
    },
  }, async ({ name }) => {
    try {
      const project = await prisma.project.findFirst({
        where: { name: name.toLowerCase(), organizationId: ctx.organizationId },
        include: {
          memories: {
            select: { type: true, author: true, contributorId: true },
          },
          assignments: {
            where: { removedAt: null },
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });

      if (!project) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Project "${name}" not found.`,
            },
          ],
        };
      }

      const byType: Record<string, number> = {};
      const byAuthor: Record<string, number> = {};
      for (const m of project.memories) {
        byType[m.type] = (byType[m.type] ?? 0) + 1;
        byAuthor[m.author] = (byAuthor[m.author] ?? 0) + 1;
      }

      const typeStats = Object.entries(byType)
        .map(([t, c]) => `  ${t}: ${c}`)
        .join("\n");
      const authorStats = Object.entries(byAuthor)
        .map(([a, c]) => `  ${a}: ${c}`)
        .join("\n");

      const contributors = project.assignments
        .map((a) => `  ${a.user.name ?? a.user.email} (${a.role})`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Project: ${project.name}`,
              `Status: ${project.status}`,
              `Stack: ${project.stack.join(", ")}`,
              `Description: ${project.description ?? "none"}`,
              `Total memories: ${project.memories.length}`,
              `\nBy type:\n${typeStats || "  none"}`,
              `\nBy author:\n${authorStats || "  none"}`,
              `\nContributors:\n${contributors || "  none assigned"}`,
              `\nCreated: ${project.createdAt.toISOString()}`,
            ].join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("project_list", {
    description: "List all registered projects.",
    inputSchema: {},
  }, async () => {
    try {
      const projects = await prisma.project.findMany({
        where: { organizationId: ctx.organizationId },
        include: { _count: { select: { memories: true } } },
        orderBy: { updatedAt: "desc" },
      });

      if (projects.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No projects registered yet.",
            },
          ],
        };
      }

      const formatted = projects
        .map(
          (p) =>
            `• ${p.name} [${p.status}] — ${p.stack.join(", ")} (${p._count.memories} memories)`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `${projects.length} projects:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
