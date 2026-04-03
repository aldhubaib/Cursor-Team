import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerProjectTools } from "./tools/project.js";
import { registerPlaybookTools } from "./tools/playbook.js";
import { registerBootstrapTools } from "./tools/bootstrap.js";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "cursor-team",
      version: "1.0.0",
    },
    { capabilities: { logging: {} } },
  );

  registerMemoryTools(server);
  registerProjectTools(server);
  registerPlaybookTools(server);
  registerBootstrapTools(server);

  return server;
}
