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
// #region agent log
fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-out-page',message:'sign-out page loaded',data:{clerkAvailable:typeof window.Clerk !== 'undefined'},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
// #endregion
(async()=>{
  try {
    // #region agent log
    fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-out-page:clerk-load',message:'starting Clerk.load()',data:{clerkExists:!!window.Clerk},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    await window.Clerk.load();
    // #region agent log
    fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-out-page:clerk-loaded',message:'Clerk loaded, calling signOut',data:{},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    await window.Clerk.signOut();
    window.location.href='/sign-in';
  } catch(e) {
    // #region agent log
    fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-out-page:error',message:'sign-out error',data:{error:e?.message||String(e)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
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

// #region agent log
app.get("/debug/auth-flow", async (req: Request, res: Response) => {
  const results: Record<string, unknown> = {};
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  results.h1_publishableKey = pk ? `${pk.substring(0, 12)}...` : "MISSING";
  results.h1_secretKey = sk ? `${sk.substring(0, 12)}...` : "MISSING";
  results.h1_clerkDomain = decodeClerkDomain(pk);
  results.h1_portalDomain = accountPortalDomain(pk);
  const host = req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  results.h1_detectedHost = host;
  results.h1_detectedProtocol = proto;
  results.h1_redirectUrl = `${proto}://${host}/dashboard`;
  results.h1_fullSignInUrl = `https://${accountPortalDomain(pk)}/sign-in?redirect_url=${encodeURIComponent(`${proto}://${host}/dashboard`)}`;
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.h3_dbConnection = "ok";
  } catch (e: any) {
    results.h3_dbConnection = `error: ${e.message}`;
  }
  try {
    const tableCheck = await prisma.$queryRaw`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dashboard_users')` as any[];
    results.h3_dashboardUsersTable = tableCheck[0]?.exists ?? "unknown";
  } catch (e: any) {
    results.h3_dashboardUsersTable = `error: ${e.message}`;
  }
  try {
    const count = await prisma.dashboardUser.count();
    results.h3_dashboardUserCount = count;
  } catch (e: any) {
    results.h3_dashboardUserCount = `error: ${e.message}`;
  }
  res.json(results);
});

app.get("/debug/fix-origins", async (req: Request, res: Response) => {
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  if (!sk) { res.json({ error: "no secret key" }); return; }
  try {
    const patchRes = await fetch("https://api.clerk.com/v1/instance", {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${sk}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_origins: ["https://cursor-team-production.up.railway.app"],
      }),
    });
    const text = await patchRes.text();
    res.json({ status: patchRes.status, body: text });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});
// #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-in-page:init',message:'page loaded, starting Clerk init',data:{},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-in-page:script-loaded',message:'Clerk script loaded',data:{clerkExists:!!window.Clerk},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        await window.Clerk.load();
        // #region agent log
        fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-in-page:clerk-loaded',message:'Clerk.load() complete',data:{user:!!window.Clerk.user},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        if (window.Clerk.user) {
          window.location.href = '/dashboard';
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
        // #region agent log
        fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-in-page:mounted',message:'mountSignIn called',data:{},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7491/ingest/b035acca-eb67-4f39-9af0-01a46d30c284',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5fbe'},body:JSON.stringify({sessionId:'4b5fbe',location:'sign-in-page:error',message:'Clerk init error',data:{error:e?.message||String(e)},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
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
