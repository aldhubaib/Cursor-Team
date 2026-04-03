import express, { Request, Response } from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp/server.js";
import { dashboardRouter } from "./dashboard/routes.js";
import { dashboardAccess } from "./dashboard/access.js";
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

app.use(
  "/dashboard",
  clerkMiddleware(),
  requireAuth({ signInUrl: "/sign-in" }),
  dashboardAccess,
  dashboardRouter,
);

app.get("/sign-in", (_req: Request, res: Response) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const clerkDomain = decodeClerkDomain(publishableKey);
  const host = _req.get("host") ?? "cursor-team-production.up.railway.app";
  const protocol = _req.get("x-forwarded-proto") ?? _req.protocol;
  const redirectUrl = encodeURIComponent(`${protocol}://${host}/dashboard`);
  res.redirect(`https://${clerkDomain}/sign-in?redirect_url=${redirectUrl}`);
});

app.get("/sign-out", (_req: Request, res: Response) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const clerkDomain = decodeClerkDomain(publishableKey);
  const host = _req.get("host") ?? "cursor-team-production.up.railway.app";
  const protocol = _req.get("x-forwarded-proto") ?? _req.protocol;
  const redirectUrl = encodeURIComponent(`${protocol}://${host}/sign-in`);
  res.redirect(`https://${clerkDomain}/sign-out?redirect_url=${redirectUrl}`);
});

app.get("/", (_req: Request, res: Response) => {
  res.redirect("/dashboard");
});

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
});

function decodeClerkDomain(publishableKey: string): string {
  try {
    const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    return decoded.replace(/\$$/, "");
  } catch {
    return "clerk.accounts.dev";
  }
}

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
