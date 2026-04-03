import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";

export function registerProjectTools(server: McpServer) {
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
      const existing = await prisma.project.findUnique({
        where: { name: name.toLowerCase() },
      });

      if (existing) {
        const updated = await prisma.project.update({
          where: { name: name.toLowerCase() },
          data: { stack, description },
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
          stack,
          description,
        },
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
      "Get a project's profile, stats, and summary of associated memories.",
    inputSchema: {
      name: z.string().describe("Project name"),
    },
  }, async ({ name }) => {
    try {
      const project = await prisma.project.findUnique({
        where: { name: name.toLowerCase() },
        include: {
          memories: {
            select: { type: true, author: true },
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

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Project: ${project.name}`,
              `Stack: ${project.stack.join(", ")}`,
              `Description: ${project.description ?? "none"}`,
              `Total memories: ${project.memories.length}`,
              `\nBy type:\n${typeStats || "  none"}`,
              `\nBy author:\n${authorStats || "  none"}`,
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
            `• ${p.name} — ${p.stack.join(", ")} (${p._count.memories} memories)`,
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
