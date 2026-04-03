import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { generateEmbedding } from "../../embeddings.js";
import { TEAM_MEMBERS } from "../../types.js";

export function registerBootstrapTools(server: McpServer) {
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
      let proj = await prisma.project.findUnique({
        where: { name: project.toLowerCase() },
      });

      if (!proj) {
        proj = await prisma.project.create({
          data: {
            name: project.toLowerCase(),
            stack,
            description,
          },
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
          similarity: number;
        }>
      >(
        `SELECT m.id, m.type, m.content, m.author, m.tags, m.confidence,
                p.name as project_name,
                1 - (m.embedding <=> $1::vector) as similarity
         FROM memories m
         LEFT JOIN projects p ON m."projectId" = p.id
         WHERE m.embedding IS NOT NULL
         ORDER BY m.embedding <=> $1::vector
         LIMIT 50`,
        `[${embedding.join(",")}]`,
      );

      const playbook = await prisma.playbook.findMany({
        where: { projectId: null },
        orderBy: [{ role: "asc" }, { version: "desc" }],
      });

      const allProjects = await prisma.project.findMany({
        where: { NOT: { name: project.toLowerCase() } },
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
            output += `  • (${m.type}, ${Math.round(m.similarity * 100)}% match) ${m.content.substring(0, 300)}\n`;
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
      const totalMemories = await prisma.memory.count();
      const totalProjects = await prisma.project.count();
      const totalPlaybook = await prisma.playbook.count();

      const byType = await prisma.memory.groupBy({
        by: ["type"],
        _count: true,
      });

      const byAuthor = await prisma.memory.groupBy({
        by: ["author"],
        _count: true,
      });

      let text = `=== TEAM BRAIN STATS ===\n\n`;
      text += `Total memories: ${totalMemories}\n`;
      text += `Total projects: ${totalProjects}\n`;
      text += `Playbook rules: ${totalPlaybook}\n`;

      text += `\nMemories by type:\n`;
      for (const t of byType) {
        text += `  ${t.type}: ${t._count}\n`;
      }

      text += `\nMemories by author:\n`;
      for (const a of byAuthor) {
        text += `  ${a.author}: ${a._count}\n`;
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
