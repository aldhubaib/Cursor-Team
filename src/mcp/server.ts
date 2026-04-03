import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OrgContext } from "../context.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerProjectTools } from "./tools/project.js";
import { registerPlaybookTools } from "./tools/playbook.js";
import { registerBootstrapTools } from "./tools/bootstrap.js";
import { registerHandoffTools } from "./tools/handoff.js";

export function createMcpServer(ctx: OrgContext): McpServer {
  const server = new McpServer(
    {
      name: "cursor-team",
      version: "2.0.0",
    },
    { capabilities: { logging: {} } },
  );

  registerMemoryTools(server, ctx);
  registerProjectTools(server, ctx);
  registerPlaybookTools(server, ctx);
  registerBootstrapTools(server, ctx);
  registerHandoffTools(server, ctx);

  return server;
}
