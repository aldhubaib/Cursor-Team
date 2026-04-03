import express, { Request, Response } from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp/server.js";
import { mcpAuth } from "./auth.js";
import { dashboardRouter } from "./dashboard/routes.js";
import { dashboardAccess } from "./dashboard/access.js";
import { prisma } from "./db.js";
import type { OrgContext } from "./context.js";

const app = express();
app.use(express.json());

app.post("/mcp", mcpAuth, async (req: Request, res: Response) => {
  const ctx = req.orgContext as OrgContext;
  const server = createMcpServer(ctx);
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
<style>body{margin:0;background:#0a0a0f;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:'Inter',system-ui,sans-serif;color:#7a7a8e;}
.msg{text-align:center;}.spinner{display:inline-block;width:20px;height:20px;border:2px solid #3a3a4e;border-top-color:#8b5cf6;border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle;}
@keyframes spin{to{transform:rotate(360deg)}}</style>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
</head><body><div class="msg"><span class="spinner"></span>Signing out...</div>
<script>
(async()=>{
  try {
    const script = document.createElement('script');
    script.src = 'https://${clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', '${publishableKey}');
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    await window.Clerk.load();
    await window.Clerk.signOut();
    window.location.replace('/sign-in');
  } catch(e) {
    document.querySelector('.msg').textContent = 'Sign out failed. Redirecting...';
    window.location.replace('/sign-in');
  }
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
      gap: 24px;
      width: 100%;
      max-width: 440px;
      padding: 24px;
      animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .brand { text-align: center; }
    .brand-icon {
      width: 56px; height: 56px;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      border-radius: 16px;
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 20px;
      font-size: 24px; font-weight: 700; color: white; letter-spacing: -1px;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
    }
    .brand h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
    .brand p { color: #7a7a8e; font-size: 15px; line-height: 1.5; }
    #sign-in-widget { width: 100%; min-height: 100px; }
    .loading { color: #7a7a8e; font-size: 14px; text-align: center; padding: 20px 0; }
    .error { color: #fb7185; font-size: 14px; text-align: center; padding: 20px 0; }
    .footer { color: #3a3a4e; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <div class="brand-icon">CT</div>
      <h1>Cursor Team</h1>
      <p>AI team memory for your projects</p>
    </div>
    <div id="sign-in-widget"><div class="loading">Loading sign-in...</div></div>
    <div class="footer">Invite-only access</div>
  </div>
  <script>
    (async () => {
      try {
        const script = document.createElement('script');
        script.src = 'https://${clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
        script.crossOrigin = 'anonymous';
        script.setAttribute('data-clerk-publishable-key', '${publishableKey}');
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        await window.Clerk.load();
        if (window.Clerk.user) {
          window.location.replace('/dashboard');
          return;
        }
        const el = document.getElementById('sign-in-widget');
        el.innerHTML = '';
        window.Clerk.mountSignIn(el, {
          forceRedirectUrl: '/dashboard',
          appearance: {
            variables: { colorPrimary: '#8b5cf6' },
            elements: { rootBox: { width: '100%' } }
          }
        });
      } catch (e) {
        document.getElementById('sign-in-widget').innerHTML = '<div class="error">Failed to load sign-in. Please refresh.</div>';
      }
    })();
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
