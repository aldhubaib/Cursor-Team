import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { generateEmbedding } from "../../embeddings.js";
import { logActivity } from "../../activity.js";
import { TEAM_MEMBERS } from "../../types.js";
import type { OrgContext } from "../../context.js";

export function registerBootstrapTools(server: McpServer, ctx: OrgContext) {
  server.registerTool("team_bootstrap", {
    description:
      "Nizek's main tool. Called when setting up a team for a new project. " +
      "Returns all relevant memories, playbook rules, and past decisions filtered by the project's tech stack. " +
      "This is how the team starts smart instead of from scratch.",
    inputSchema: {
      project: z.string().describe("Project name"),
      stack: z
        .array(z.string())
        .describe("Tech stack of the new project (e.g. [nextjs, prisma, clerk])"),
      description: z.string().optional().describe("Brief project description"),
    },
  }, async ({ project, stack, description }) => {
    try {
      let proj = await prisma.project.findFirst({
        where: { name: project.toLowerCase(), organizationId: ctx.organizationId },
      });

      if (!proj) {
        proj = await prisma.project.create({
          data: {
            name: project.toLowerCase(),
            organizationId: ctx.organizationId,
            stack,
            description,
          },
        });
      }

      if (ctx.userId) {
        await prisma.projectAssignment.upsert({
          where: {
            projectId_userId: { projectId: proj.id, userId: ctx.userId },
          },
          create: { projectId: proj.id, userId: ctx.userId, role: "lead" },
          update: { removedAt: null },
        });
      }

      const stackQuery = `Project using ${stack.join(", ")}. What should the team know?`;
      const embedding = await generateEmbedding(stackQuery);

      const memories = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          type: string;
          content: string;
          author: string;
          tags: string[];
          confidence: number;
          project_name: string | null;
          contributor_name: string | null;
          similarity: number;
        }>
      >(
        `SELECT m.id, m.type, m.content, m.author, m.tags, m.confidence,
                p.name as project_name,
                u.name as contributor_name,
                1 - (m.embedding <=> $1::vector) as similarity
         FROM memories m
         LEFT JOIN projects p ON m."projectId" = p.id
         LEFT JOIN users u ON m."contributorId" = u.id
         WHERE m.embedding IS NOT NULL AND m."organizationId" = $2
         ORDER BY m.embedding <=> $1::vector
         LIMIT 50`,
        `[${embedding.join(",")}]`,
        ctx.organizationId,
      );

      const playbook = await prisma.playbook.findMany({
        where: { organizationId: ctx.organizationId, projectId: null },
        orderBy: [{ role: "asc" }, { version: "desc" }],
      });

      const allProjects = await prisma.project.findMany({
        where: {
          organizationId: ctx.organizationId,
          NOT: { name: project.toLowerCase() },
        },
        include: { _count: { select: { memories: true } } },
      });

      const stackMatchedProjects = allProjects.filter((p) =>
        p.stack.some((s) => stack.includes(s)),
      );

      let output = `=== TEAM BOOTSTRAP FOR "${project.toUpperCase()}" ===\n`;
      output += `Stack: ${stack.join(", ")}\n`;
      output += `Description: ${description ?? "not provided"}\n\n`;

      output += `--- TEAM MEMBERS ---\n`;
      for (const [id, member] of Object.entries(TEAM_MEMBERS)) {
        output += `• ${member.name} (${id}) — ${member.role}\n`;
      }

      if (stackMatchedProjects.length > 0) {
        output += `\n--- SIMILAR PAST PROJECTS ---\n`;
        for (const p of stackMatchedProjects) {
          const sharedStack = p.stack.filter((s) => stack.includes(s));
          output += `• ${p.name} — shared stack: ${sharedStack.join(", ")} (${p._count.memories} memories)\n`;
        }
      }

      if (memories.length > 0) {
        output += `\n--- RELEVANT MEMORIES (${memories.length}) ---\n\n`;

        const byRole: Record<string, typeof memories> = {};
        for (const m of memories) {
          const role = m.author;
          if (!byRole[role]) byRole[role] = [];
          byRole[role].push(m);
        }

        for (const [role, mems] of Object.entries(byRole)) {
          output += `[${role.toUpperCase()}]\n`;
          for (const m of mems.slice(0, 10)) {
            const via = m.contributor_name ? ` (via ${m.contributor_name})` : "";
            output += `  • (${m.type}, ${Math.round(m.similarity * 100)}% match)${via} ${m.content.substring(0, 300)}\n`;
          }
          output += "\n";
        }
      } else {
        output += `\n--- NO MEMORIES YET ---\n`;
        output += `This appears to be a fresh team. Memories will accumulate as the team works.\n`;
      }

      if (playbook.length > 0) {
        output += `--- GLOBAL PLAYBOOK RULES ---\n`;
        const byRole: Record<string, string[]> = {};
        for (const r of playbook) {
          if (!byRole[r.role]) byRole[r.role] = [];
          byRole[r.role].push(r.rule);
        }
        for (const [role, rules] of Object.entries(byRole)) {
          output += `\n[${role}]\n`;
          for (const rule of rules) {
            output += `  • ${rule}\n`;
          }
        }
      }

      await logActivity(ctx, "team_bootstrap", {
        projectId: proj.id,
        agentRole: "nizek",
        metadata: { stack, memoriesFound: memories.length },
      });

      return {
        content: [{ type: "text" as const, text: output }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error bootstrapping team: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("team_stats", {
    description: "Get overall stats about the team's knowledge base.",
    inputSchema: {},
  }, async () => {
    try {
      const totalMemories = await prisma.memory.count({
        where: { organizationId: ctx.organizationId },
      });
      const totalProjects = await prisma.project.count({
        where: { organizationId: ctx.organizationId },
      });
      const totalPlaybook = await prisma.playbook.count({
        where: { organizationId: ctx.organizationId },
      });
      const totalActivities = await prisma.activity.count({
        where: { organizationId: ctx.organizationId },
      });

      const byType = await prisma.memory.groupBy({
        by: ["type"],
        where: { organizationId: ctx.organizationId },
        _count: true,
      });

      const byAuthor = await prisma.memory.groupBy({
        by: ["author"],
        where: { organizationId: ctx.organizationId },
        _count: true,
      });

      const members = await prisma.orgMember.findMany({
        where: { organizationId: ctx.organizationId },
        include: { user: { select: { name: true, email: true } } },
      });

      let text = `=== TEAM BRAIN STATS ===\n\n`;
      text += `Total memories: ${totalMemories}\n`;
      text += `Total projects: ${totalProjects}\n`;
      text += `Playbook rules: ${totalPlaybook}\n`;
      text += `Activity events: ${totalActivities}\n`;
      text += `Team members: ${members.length}\n`;

      text += `\nMemories by type:\n`;
      for (const t of byType) {
        text += `  ${t.type}: ${t._count}\n`;
      }

      text += `\nMemories by agent:\n`;
      for (const a of byAuthor) {
        text += `  ${a.author}: ${a._count}\n`;
      }

      if (members.length > 0) {
        text += `\nOrg members:\n`;
        for (const m of members) {
          text += `  ${m.user.name ?? m.user.email} (${m.role})\n`;
        }
      }

      return {
        content: [{ type: "text" as const, text }],
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
