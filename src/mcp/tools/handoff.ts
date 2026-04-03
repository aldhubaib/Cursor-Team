import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { logActivity } from "../../activity.js";
import type { OrgContext } from "../../context.js";

export function registerHandoffTools(server: McpServer, ctx: OrgContext) {
  server.registerTool("project_handoff", {
    description:
      "Generate a full handoff briefing for a project. Collects all decisions, bugs, configs, architecture, " +
      "contributors, and timeline into a structured document. Sets the project status to 'handoff'.",
    inputSchema: {
      project: z.string().describe("Project name to generate handoff for"),
    },
  }, async ({ project: projectName }) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          name: projectName.toLowerCase(),
          organizationId: ctx.organizationId,
        },
        include: {
          assignments: {
            where: { removedAt: null },
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });

      if (!project) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${projectName}" not found.`,
          }],
        };
      }

      const memories = await prisma.memory.findMany({
        where: {
          projectId: project.id,
          organizationId: ctx.organizationId,
        },
        include: { contributor: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });

      const playbookRules = await prisma.playbook.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [{ projectId: null }, { projectId: project.id }],
        },
        orderBy: [{ role: "asc" }, { version: "desc" }],
      });

      const recentActivity = await prisma.activity.findMany({
        where: {
          projectId: project.id,
          organizationId: ctx.organizationId,
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      await prisma.project.update({
        where: { id: project.id },
        data: { status: "handoff" },
      });

      const byType: Record<string, typeof memories> = {};
      for (const m of memories) {
        if (!byType[m.type]) byType[m.type] = [];
        byType[m.type].push(m);
      }

      let briefing = `=== HANDOFF BRIEFING: ${project.name.toUpperCase()} ===\n\n`;

      briefing += `--- PROJECT PROFILE ---\n`;
      briefing += `Name: ${project.name}\n`;
      briefing += `Stack: ${project.stack.join(", ")}\n`;
      briefing += `Description: ${project.description ?? "none"}\n`;
      briefing += `Status: handoff (was ${project.status})\n`;
      briefing += `Created: ${project.createdAt.toISOString()}\n`;
      briefing += `Total memories: ${memories.length}\n\n`;

      briefing += `--- CURRENT CONTRIBUTORS ---\n`;
      if (project.assignments.length > 0) {
        for (const a of project.assignments) {
          briefing += `• ${a.user.name ?? a.user.email} (${a.role})\n`;
        }
      } else {
        briefing += `No contributors assigned.\n`;
      }
      briefing += "\n";

      const typeOrder = ["decision", "config", "pattern", "lesson", "debug", "review", "prompt"] as const;
      for (const memType of typeOrder) {
        const mems = byType[memType];
        if (!mems?.length) continue;

        briefing += `--- ${memType.toUpperCase()} (${mems.length}) ---\n`;
        for (const m of mems) {
          const via = m.contributor ? ` (via ${m.contributor.name})` : "";
          const date = m.createdAt.toISOString().split("T")[0];
          briefing += `  [${date}] ${m.author}${via}: ${m.content}\n`;
          if (m.tags.length > 0) {
            briefing += `    Tags: ${m.tags.join(", ")}\n`;
          }
        }
        briefing += "\n";
      }

      if (playbookRules.length > 0) {
        briefing += `--- APPLICABLE PLAYBOOK RULES ---\n`;
        const byRole: Record<string, string[]> = {};
        for (const r of playbookRules) {
          if (!byRole[r.role]) byRole[r.role] = [];
          byRole[r.role].push(r.rule);
        }
        for (const [role, rules] of Object.entries(byRole)) {
          briefing += `[${role}]\n`;
          for (const rule of rules) {
            briefing += `  • ${rule}\n`;
          }
        }
        briefing += "\n";
      }

      if (recentActivity.length > 0) {
        briefing += `--- RECENT ACTIVITY ---\n`;
        for (const a of recentActivity) {
          const who = a.user?.name ?? "unknown";
          const date = a.createdAt.toISOString().split("T")[0];
          briefing += `  [${date}] ${who} → ${a.action}${a.agentRole ? ` (${a.agentRole})` : ""}\n`;
        }
      }

      await logActivity(ctx, "project_handoff", {
        projectId: project.id,
        metadata: { memoryCount: memories.length },
      });

      return {
        content: [{ type: "text" as const, text: briefing }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error generating handoff: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });

  server.registerTool("project_onboard", {
    description:
      "Onboard onto a project. Returns a structured briefing of everything the team knows, " +
      "adds you as a contributor, and logs the onboarding event.",
    inputSchema: {
      project: z.string().describe("Project name to onboard onto"),
    },
  }, async ({ project: projectName }) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          name: projectName.toLowerCase(),
          organizationId: ctx.organizationId,
        },
      });

      if (!project) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${projectName}" not found.`,
          }],
        };
      }

      if (ctx.userId) {
        await prisma.projectAssignment.upsert({
          where: {
            projectId_userId: { projectId: project.id, userId: ctx.userId },
          },
          create: {
            projectId: project.id,
            userId: ctx.userId,
            role: "contributor",
          },
          update: { removedAt: null },
        });
      }

      if (project.status === "handoff") {
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "active" },
        });
      }

      const memories = await prisma.memory.findMany({
        where: {
          projectId: project.id,
          organizationId: ctx.organizationId,
        },
        include: { contributor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });

      const assignments = await prisma.projectAssignment.findMany({
        where: { projectId: project.id, removedAt: null },
        include: { user: { select: { name: true, email: true } } },
      });

      let briefing = `=== ONBOARDING: ${project.name.toUpperCase()} ===\n\n`;
      briefing += `Stack: ${project.stack.join(", ")}\n`;
      briefing += `Description: ${project.description ?? "none"}\n`;
      briefing += `Total knowledge: ${memories.length} memories\n\n`;

      briefing += `--- YOUR TEAM ON THIS PROJECT ---\n`;
      for (const a of assignments) {
        briefing += `• ${a.user.name ?? a.user.email} (${a.role})\n`;
      }
      briefing += "\n";

      const critical = memories.filter((m) =>
        ["decision", "config"].includes(m.type),
      );
      if (critical.length > 0) {
        briefing += `--- KEY DECISIONS & CONFIG (read these first) ---\n`;
        for (const m of critical.slice(0, 20)) {
          const via = m.contributor ? ` (via ${m.contributor.name})` : "";
          briefing += `  [${m.type}] ${m.author}${via}: ${m.content.substring(0, 300)}\n`;
        }
        briefing += "\n";
      }

      const bugs = memories.filter((m) => m.type === "debug");
      if (bugs.length > 0) {
        briefing += `--- KNOWN BUGS & FIXES (${bugs.length}) ---\n`;
        for (const m of bugs.slice(0, 10)) {
          briefing += `  • ${m.author}: ${m.content.substring(0, 200)}\n`;
        }
        briefing += "\n";
      }

      const patterns = memories.filter((m) => m.type === "pattern");
      if (patterns.length > 0) {
        briefing += `--- PATTERNS & CONVENTIONS ---\n`;
        for (const m of patterns.slice(0, 10)) {
          briefing += `  • ${m.content.substring(0, 200)}\n`;
        }
      }

      await logActivity(ctx, "project_onboard", {
        projectId: project.id,
        metadata: { memoryCount: memories.length },
      });

      return {
        content: [{ type: "text" as const, text: briefing }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error onboarding: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });

  server.registerTool("project_health", {
    description:
      "Check how well-documented a project is. Shows memory coverage by type, " +
      "contributor count, last activity, and gaps.",
    inputSchema: {
      project: z.string().describe("Project name to check"),
    },
  }, async ({ project: projectName }) => {
    try {
      const project = await prisma.project.findFirst({
        where: {
          name: projectName.toLowerCase(),
          organizationId: ctx.organizationId,
        },
      });

      if (!project) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${projectName}" not found.`,
          }],
        };
      }

      const memories = await prisma.memory.groupBy({
        by: ["type"],
        where: { projectId: project.id, organizationId: ctx.organizationId },
        _count: true,
      });

      const totalMemories = memories.reduce((sum, m) => sum + m._count, 0);
      const typeMap = Object.fromEntries(memories.map((m) => [m.type, m._count]));

      const contributors = await prisma.projectAssignment.count({
        where: { projectId: project.id, removedAt: null },
      });

      const uniqueContributors = await prisma.memory.groupBy({
        by: ["contributorId"],
        where: {
          projectId: project.id,
          organizationId: ctx.organizationId,
          contributorId: { not: null },
        },
      });

      const lastActivity = await prisma.activity.findFirst({
        where: { projectId: project.id, organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
      });

      const lastMemory = await prisma.memory.findFirst({
        where: { projectId: project.id, organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
      });

      const expectedTypes = ["decision", "pattern", "lesson", "debug", "config"];
      const gaps = expectedTypes.filter((t) => !typeMap[t]);

      let health = `=== PROJECT HEALTH: ${project.name.toUpperCase()} ===\n\n`;
      health += `Status: ${project.status}\n`;
      health += `Total memories: ${totalMemories}\n`;
      health += `Assigned contributors: ${contributors}\n`;
      health += `Unique human contributors: ${uniqueContributors.length}\n`;
      health += `Last activity: ${lastActivity ? lastActivity.createdAt.toISOString().split("T")[0] : "never"}\n`;
      health += `Last memory: ${lastMemory ? lastMemory.createdAt.toISOString().split("T")[0] : "never"}\n\n`;

      health += `--- COVERAGE BY TYPE ---\n`;
      for (const t of expectedTypes) {
        const count = typeMap[t] ?? 0;
        const bar = count > 0 ? "█".repeat(Math.min(count, 20)) : "░";
        health += `  ${t.padEnd(10)} ${bar} ${count}\n`;
      }
      health += "\n";

      if (gaps.length > 0) {
        health += `--- GAPS (missing knowledge) ---\n`;
        for (const gap of gaps) {
          const suggestion: Record<string, string> = {
            decision: "No architecture/design decisions recorded. The team should document key choices.",
            pattern: "No coding patterns documented. Store recurring patterns and conventions.",
            lesson: "No lessons learned. Store takeaways from debugging, reviews, and incidents.",
            debug: "No bug fixes recorded. When bugs are fixed, store the root cause and solution.",
            config: "No deployment/config knowledge. Store environment setup, deployment steps, and gotchas.",
          };
          health += `  ⚠ ${gap}: ${suggestion[gap] ?? "No entries."}\n`;
        }
        health += "\n";
      }

      const busFactor = uniqueContributors.length;
      if (busFactor <= 1) {
        health += `--- WARNING ---\n`;
        health += `  Bus factor = ${busFactor}. Only ${busFactor === 0 ? "no one" : "one person"} has contributed knowledge to this project.\n`;
        health += `  If they leave, the knowledge goes with them. Get more people documenting.\n`;
      }

      return {
        content: [{ type: "text" as const, text: health }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error checking health: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  });
}
