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
  res.send(signInPage(publishableKey, clerkDomain));
});

app.get("/sign-out", (_req: Request, res: Response) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const clerkDomain = decodeClerkDomain(publishableKey);
  res.send(`<!DOCTYPE html>
<html><head><title>Signing out…</title>
<style>body{margin:0;background:#0a0a0f;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:system-ui;color:#7a7a8e;}</style>
</head><body><p>Signing out...</p>
<script src="https://${clerkDomain}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
  data-clerk-publishable-key="${publishableKey}" crossorigin="anonymous"></script>
<script>
(async()=>{
  await window.Clerk.load();
  await window.Clerk.signOut();
  window.location.href='/sign-in';
})();
</script>
</body></html>`);
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

function accountPortalDomain(publishableKey: string): string {
  const frontendApi = decodeClerkDomain(publishableKey);
  return frontendApi.replace(".clerk.accounts.dev", ".accounts.dev");
}

function signInPage(publishableKey: string, clerkDomain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Cursor Team</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #08080d;
      color: #e0e0e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      width: 100%;
      max-width: 440px;
      padding: 24px;
    }
    .brand {
      text-align: center;
    }
    .brand-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      font-size: 22px;
      font-weight: 700;
      color: white;
      letter-spacing: -1px;
    }
    .brand h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }
    .brand p {
      color: #7a7a8e;
      font-size: 14px;
      line-height: 1.5;
    }
    #sign-in-container {
      width: 100%;
      min-height: 360px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #1e1e2e;
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer {
      color: #4a4a5e;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <div class="brand-icon">CT</div>
      <h1>Cursor Team</h1>
      <p>AI team memory for your projects</p>
    </div>
    <div id="sign-in-container">
      <div class="spinner"></div>
    </div>
    <div class="footer">Invite-only access</div>
  </div>
  <script>
    const s = document.createElement('script');
    s.setAttribute('data-clerk-publishable-key', '${publishableKey}');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://${clerkDomain}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    s.addEventListener('load', async () => {
      try {
        await window.Clerk.load();
        if (window.Clerk.user) { window.location.href = '/dashboard'; return; }
        const el = document.getElementById('sign-in-container');
        el.innerHTML = '';
        window.Clerk.mountSignIn(el, {
          afterSignInUrl: '/dashboard',
          afterSignUpUrl: '/dashboard',
          appearance: {
            variables: { colorPrimary: '#8b5cf6' },
            elements: {
              rootBox: { width: '100%' },
              card: { background: 'transparent', boxShadow: 'none', border: 'none' }
            }
          }
        });
      } catch (err) {
        document.getElementById('sign-in-container').innerHTML =
          '<p style="color:#f43f5e;font-size:14px;">Failed to load. <a href="/sign-in" style="color:#8b5cf6;">Retry</a></p>';
      }
    });
    s.addEventListener('error', () => {
      document.getElementById('sign-in-container').innerHTML =
        '<p style="color:#f43f5e;font-size:14px;">Failed to load. <a href="/sign-in" style="color:#8b5cf6;">Retry</a></p>';
    });
    document.body.appendChild(s);
  </script>
</body>
</html>`;
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
