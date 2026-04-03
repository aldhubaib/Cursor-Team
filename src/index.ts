import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp/server.js";
import { dashboardRouter } from "./dashboard/routes.js";
import { prisma } from "./db.js";

const app = express();
app.use(express.json());

function authMiddleware(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  const expected = process.env.API_SECRET_TOKEN;

  if (!expected) return next();

  if (auth === `Bearer ${expected}`) return next();

  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Unauthorized" },
    id: null,
  });
}

app.post("/mcp", authMiddleware, async (req: Request, res: Response) => {
  const server = createMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST." },
    id: null,
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.use("/dashboard", dashboardRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "cursor-team",
    version: "1.0.0",
    description: "Cloud-based AI team memory for Cursor IDE",
    endpoints: {
      mcp: "/mcp",
      dashboard: "/dashboard",
    },
  });
});

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cursor Team MCP server running on port ${PORT}`);
  console.log(`  MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`  Dashboard:    http://0.0.0.0:${PORT}/dashboard`);
  console.log(`  Health:       http://0.0.0.0:${PORT}/health`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
