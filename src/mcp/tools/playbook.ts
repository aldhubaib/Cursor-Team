import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { logActivity } from "../../activity.js";
import type { OrgContext } from "../../context.js";

export function registerPlaybookTools(server: McpServer, ctx: OrgContext) {
  server.registerTool("playbook_get", {
    description:
      "Get the playbook rules for a team member role. These are the accumulated best practices.",
    inputSchema: {
      role: z
        .string()
        .describe(
          "Role to get rules for (e.g. architect, reviewer, debugger, pm, prompt_engineer, devops, team_builder)",
        ),
      project: z
        .string()
        .optional()
        .describe("Also include project-specific rules"),
    },
  }, async ({ role, project }) => {
    try {
      const rules = await prisma.playbook.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: role.toLowerCase(),
          OR: [
            { projectId: null },
            ...(project
              ? [{ project: { name: project.toLowerCase(), organizationId: ctx.organizationId } }]
              : []),
          ],
        },
        include: { project: { select: { name: true } } },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      });

      if (rules.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No playbook rules found for role "${role}".`,
            },
          ],
        };
      }

      const globalRules = rules.filter((r) => !r.projectId);
      const projectRules = rules.filter((r) => r.projectId);

      let text = `Playbook for ${role} (${rules.length} rules):\n\n`;

      if (globalRules.length > 0) {
        text += `=== Global Rules ===\n`;
        text += globalRules
          .map((r, i) => `${i + 1}. (v${r.version}) ${r.rule}`)
          .join("\n");
      }

      if (projectRules.length > 0) {
        text += `\n\n=== Project-Specific Rules ===\n`;
        text += projectRules
          .map(
            (r, i) =>
              `${i + 1}. [${r.project?.name}] (v${r.version}) ${r.rule}`,
          )
          .join("\n");
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

  server.registerTool("playbook_update", {
    description:
      "Add or update a playbook rule for a team member role. Rules accumulate over time — this is how the team gets smarter.",
    inputSchema: {
      role: z.string().describe("Role this rule applies to"),
      rule: z.string().describe("The rule / best practice"),
      project: z
        .string()
        .optional()
        .describe("If set, this rule only applies to this project"),
    },
  }, async ({ role, rule, project }) => {
    try {
      let projectId: string | null = null;
      if (project) {
        const p = await prisma.project.findFirst({
          where: { name: project.toLowerCase(), organizationId: ctx.organizationId },
        });
        projectId = p?.id ?? null;
      }

      const existing = await prisma.playbook.findFirst({
        where: {
          organizationId: ctx.organizationId,
          role: role.toLowerCase(),
          rule,
          projectId,
        },
      });

      if (existing) {
        const updated = await prisma.playbook.update({
          where: { id: existing.id },
          data: { version: existing.version + 1 },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated existing rule to v${updated.version} for role "${role}".`,
            },
          ],
        };
      }

      await prisma.playbook.create({
        data: {
          organizationId: ctx.organizationId,
          role: role.toLowerCase(),
          rule,
          projectId,
        },
      });

      await logActivity(ctx, "playbook_update", {
        projectId,
        agentRole: role.toLowerCase(),
        metadata: { rule: rule.substring(0, 100) },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Added new playbook rule for role "${role}".`,
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
