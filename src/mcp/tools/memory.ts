import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db.js";
import { generateEmbedding } from "../../embeddings.js";
import { logActivity } from "../../activity.js";
import { MEMORY_TYPES } from "../../types.js";
import type { OrgContext } from "../../context.js";

export function registerMemoryTools(server: McpServer, ctx: OrgContext) {
  server.registerTool("memory_store", {
    description:
      "Store a new memory (decision, pattern, lesson, prompt template, review finding, debug fix, config, or design). This is how the team learns.",
    inputSchema: {
      type: z.enum(MEMORY_TYPES),
      content: z.string().describe("The knowledge to store"),
      author: z.string().describe("Team member storing this (e.g. sam, raya)"),
      project: z
        .string()
        .optional()
        .describe("Project name this memory belongs to"),
      tags: z.array(z.string()).optional().describe("Searchable tags"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Confidence score 0-1, defaults to 1.0"),
    },
  }, async ({ type, content, author, project, tags, confidence }) => {
    try {
      const embedding = await generateEmbedding(content);

      let projectRecord = null;
      if (project) {
        projectRecord = await prisma.project.findFirst({
          where: { name: project, organizationId: ctx.organizationId },
        });
      }

      const memory = await prisma.memory.create({
        data: {
          type,
          content,
          author: author.toLowerCase(),
          organizationId: ctx.organizationId,
          projectId: projectRecord?.id ?? null,
          contributorId: ctx.userId,
          tags: tags ?? [],
          confidence: confidence ?? 1.0,
        },
      });

      await prisma.$executeRawUnsafe(
        `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
        `[${embedding.join(",")}]`,
        memory.id,
      );

      await logActivity(ctx, "memory_store", {
        projectId: projectRecord?.id,
        agentRole: author.toLowerCase(),
        metadata: { memoryId: memory.id, type, tags: tags ?? [] },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Stored memory (${type}) by ${author}. ID: ${memory.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error storing memory: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("memory_search", {
    description:
      "Semantic search across all team memories. Ask a question and get the most relevant knowledge back.",
    inputSchema: {
      query: z.string().describe("Natural language query"),
      limit: z.number().optional().describe("Max results, defaults to 10"),
      type: z.enum(MEMORY_TYPES).optional().describe("Filter by memory type"),
      author: z.string().optional().describe("Filter by team member"),
      project: z.string().optional().describe("Filter by project name"),
    },
  }, async ({ query, limit, type, author, project }) => {
    try {
      const embedding = await generateEmbedding(query);
      const n = limit ?? 10;

      const conditions: string[] = [`m."organizationId" = $3`];
      const params: unknown[] = [`[${embedding.join(",")}]`, n, ctx.organizationId];
      let paramIdx = 4;

      if (type) {
        conditions.push(`m.type = $${paramIdx}::memories_type_enum`);
        params.push(type);
        paramIdx++;
      }
      if (author) {
        conditions.push(`m.author = $${paramIdx}`);
        params.push(author.toLowerCase());
        paramIdx++;
      }
      if (project) {
        conditions.push(`p.name = $${paramIdx}`);
        params.push(project);
        paramIdx++;
      }

      const whereClause = `WHERE m.embedding IS NOT NULL AND ${conditions.join(" AND ")}`;

      const results = await prisma.$queryRawUnsafe<
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
          created_at: Date;
        }>
      >(
        `SELECT m.id, m.type, m.content, m.author, m.tags, m.confidence,
                p.name as project_name,
                u.name as contributor_name,
                1 - (m.embedding <=> $1::vector) as similarity,
                m."createdAt" as created_at
         FROM memories m
         LEFT JOIN projects p ON m."projectId" = p.id
         LEFT JOIN users u ON m."contributorId" = u.id
         ${whereClause}
         ORDER BY m.embedding <=> $1::vector
         LIMIT $2`,
        ...params,
      );

      await logActivity(ctx, "memory_search", {
        metadata: { query, resultCount: results.length },
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found matching your query.",
            },
          ],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.type}] (${Math.round(r.similarity * 100)}% match)\n` +
            `   Author: ${r.author}${r.contributor_name ? ` (via ${r.contributor_name})` : ""}${r.project_name ? ` | Project: ${r.project_name}` : ""}\n` +
            `   Tags: ${r.tags.length > 0 ? r.tags.join(", ") : "none"}\n` +
            `   ${r.content}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} memories:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching memories: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("memory_list", {
    description: "List memories with filters. Good for browsing what the team knows.",
    inputSchema: {
      type: z.enum(MEMORY_TYPES).optional(),
      author: z.string().optional(),
      project: z.string().optional(),
      limit: z.number().optional().describe("Max results, defaults to 20"),
      offset: z.number().optional().describe("Skip first N results"),
    },
  }, async ({ type, author, project, limit, offset }) => {
    try {
      const where: Record<string, unknown> = {
        organizationId: ctx.organizationId,
      };
      if (type) where.type = type;
      if (author) where.author = author.toLowerCase();
      if (project) where.project = { name: project, organizationId: ctx.organizationId };

      const memories = await prisma.memory.findMany({
        where,
        include: {
          project: { select: { name: true } },
          contributor: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit ?? 20,
        skip: offset ?? 0,
      });

      const total = await prisma.memory.count({ where });

      if (memories.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No memories found." },
          ],
        };
      }

      const formatted = memories
        .map(
          (m, i) =>
            `${(offset ?? 0) + i + 1}. [${m.type}] by ${m.author}${m.contributor ? ` (via ${m.contributor.name})` : ""}${m.project ? ` (${m.project.name})` : ""}\n` +
            `   Tags: ${m.tags.length > 0 ? m.tags.join(", ") : "none"} | Confidence: ${m.confidence}\n` +
            `   ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Memories ${(offset ?? 0) + 1}-${(offset ?? 0) + memories.length} of ${total}:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing memories: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.registerTool("memory_delete", {
    description: "Delete an outdated or incorrect memory by ID.",
    inputSchema: {
      id: z.string().describe("Memory ID to delete"),
    },
  }, async ({ id }) => {
    try {
      await prisma.memory.delete({
        where: { id, organizationId: ctx.organizationId },
      });

      await logActivity(ctx, "memory_delete", {
        metadata: { memoryId: id },
      });

      return {
        content: [
          { type: "text" as const, text: `Deleted memory ${id}` },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error deleting memory: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
