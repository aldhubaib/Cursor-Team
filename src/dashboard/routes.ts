import express, { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { TEAM_MEMBERS } from "../types.js";
import { renderPage } from "./render.js";
import type { DashboardLocals } from "./access.js";

export const dashboardRouter = Router();
dashboardRouter.use(express.urlencoded({ extended: false }));

dashboardRouter.get("/", async (_req: Request, res: Response) => {
  const totalMemories = await prisma.memory.count();
  const totalProjects = await prisma.project.count();
  const totalPlaybook = await prisma.playbook.count();

  const byType = await prisma.memory.groupBy({ by: ["type"], _count: true });
  const byAuthor = await prisma.memory.groupBy({
    by: ["author"],
    _count: true,
  });

  const recentMemories = await prisma.memory.findMany({
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const typeCards = byType
    .map(
      (t) =>
        `<div class="stat-card"><span class="stat-label">${t.type}</span><span class="stat-value">${t._count}</span></div>`,
    )
    .join("");

  const authorCards = byAuthor
    .map(
      (a) =>
        `<div class="stat-card"><span class="stat-label">${a.author}</span><span class="stat-value">${a._count}</span></div>`,
    )
    .join("");

  const recentRows = recentMemories
    .map(
      (m) =>
        `<tr>
          <td><span class="badge badge-${m.type}">${m.type}</span></td>
          <td>${m.author}</td>
          <td>${m.project?.name ?? "—"}</td>
          <td class="content-cell">${escapeHtml(m.content.substring(0, 120))}${m.content.length > 120 ? "…" : ""}</td>
          <td>${timeAgo(m.createdAt)}</td>
        </tr>`,
    )
    .join("");

  res.send(
    renderPage(
      "Overview",
      `
      <div class="stats-row">
        <div class="stat-card stat-primary"><span class="stat-value">${totalMemories}</span><span class="stat-label">Memories</span></div>
        <div class="stat-card stat-primary"><span class="stat-value">${totalProjects}</span><span class="stat-label">Projects</span></div>
        <div class="stat-card stat-primary"><span class="stat-value">${totalPlaybook}</span><span class="stat-label">Playbook Rules</span></div>
      </div>

      <h2>By Type</h2>
      <div class="stats-row">${typeCards || "<p>No memories yet.</p>"}</div>

      <h2>By Team Member</h2>
      <div class="stats-row">${authorCards || "<p>No memories yet.</p>"}</div>

      <h2>Recent Activity</h2>
      <table>
        <thead><tr><th>Type</th><th>Author</th><th>Project</th><th>Content</th><th>When</th></tr></thead>
        <tbody>${recentRows || "<tr><td colspan='5'>No activity yet.</td></tr>"}</tbody>
      </table>
    `,
    ),
  );
});

dashboardRouter.get("/projects", async (_req: Request, res: Response) => {
  const projects = await prisma.project.findMany({
    include: { _count: { select: { memories: true, playbook: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const cards = projects
    .map(
      (p) =>
        `<div class="card">
          <h3>${p.name}</h3>
          <p class="stack">${p.stack.map((s) => `<span class="tag">${s}</span>`).join(" ")}</p>
          <p>${p.description ?? "<em>No description</em>"}</p>
          <div class="stats-row">
            <div class="stat-card"><span class="stat-value">${p._count.memories}</span><span class="stat-label">memories</span></div>
            <div class="stat-card"><span class="stat-value">${p._count.playbook}</span><span class="stat-label">rules</span></div>
          </div>
        </div>`,
    )
    .join("");

  res.send(
    renderPage("Projects", cards || `<div class="card"><p>No projects registered yet.</p></div>`),
  );
});

dashboardRouter.get("/team", async (_req: Request, res: Response) => {
  const byAuthor = await prisma.memory.groupBy({
    by: ["author"],
    _count: true,
  });
  const authorMap = Object.fromEntries(byAuthor.map((a) => [a.author, a._count]));

  const cards = Object.entries(TEAM_MEMBERS)
    .map(
      ([id, member]) =>
        `<div class="card">
          <h3>${member.name}</h3>
          <p class="role">${member.role}</p>
          <p class="stat-value">${authorMap[id] ?? 0} memories stored</p>
        </div>`,
    )
    .join("");

  res.send(renderPage("Team", `<div class="grid">${cards}</div>`));
});

dashboardRouter.get("/memories", async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const author = req.query.author as string | undefined;
  const project = req.query.project as string | undefined;
  const page = parseInt((req.query.page as string) ?? "1", 10);
  const perPage = 20;

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (author) where.author = author;
  if (project) where.project = { name: project };

  const [memories, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
    }),
    prisma.memory.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const filters = `
    <div class="filters">
      <select onchange="applyFilter('type', this.value)">
        <option value="">All types</option>
        ${["decision", "pattern", "lesson", "prompt", "review", "debug", "config"]
          .map((t) => `<option value="${t}" ${type === t ? "selected" : ""}>${t}</option>`)
          .join("")}
      </select>
      <select onchange="applyFilter('author', this.value)">
        <option value="">All authors</option>
        ${Object.keys(TEAM_MEMBERS)
          .map((a) => `<option value="${a}" ${author === a ? "selected" : ""}>${a}</option>`)
          .join("")}
      </select>
    </div>
    <script>
      function applyFilter(key, value) {
        const url = new URL(window.location);
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        url.searchParams.set('page', '1');
        window.location = url;
      }
    </script>
  `;

  const rows = memories
    .map(
      (m) =>
        `<tr>
          <td><span class="badge badge-${m.type}">${m.type}</span></td>
          <td>${m.author}</td>
          <td>${m.project?.name ?? "—"}</td>
          <td>${m.tags.map((t) => `<span class="tag">${t}</span>`).join(" ") || "—"}</td>
          <td class="content-cell">${escapeHtml(m.content)}</td>
          <td>${m.confidence}</td>
          <td>${timeAgo(m.createdAt)}</td>
        </tr>`,
    )
    .join("");

  const pagination =
    totalPages > 1
      ? `<div class="pagination">
          ${page > 1 ? `<a href="?page=${page - 1}${type ? `&type=${type}` : ""}${author ? `&author=${author}` : ""}">← Prev</a>` : ""}
          <span>Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<a href="?page=${page + 1}${type ? `&type=${type}` : ""}${author ? `&author=${author}` : ""}">Next →</a>` : ""}
        </div>`
      : "";

  res.send(
    renderPage(
      "Memories",
      `
      ${filters}
      <table>
        <thead><tr><th>Type</th><th>Author</th><th>Project</th><th>Tags</th><th>Content</th><th>Conf.</th><th>When</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='7'>No memories found.</td></tr>"}</tbody>
      </table>
      ${pagination}
    `,
    ),
  );
});

dashboardRouter.get("/playbook", async (_req: Request, res: Response) => {
  const rules = await prisma.playbook.findMany({
    include: { project: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { version: "desc" }],
  });

  const byRole: Record<string, typeof rules> = {};
  for (const r of rules) {
    if (!byRole[r.role]) byRole[r.role] = [];
    byRole[r.role].push(r);
  }

  const sections = Object.entries(byRole)
    .map(
      ([role, ruleList]) =>
        `<div class="card">
          <h3>${role}</h3>
          ${ruleList
            .map(
              (r) =>
                `<div class="rule">
                  <span class="badge">v${r.version}</span>
                  ${r.project ? `<span class="tag">${r.project.name}</span>` : '<span class="tag">global</span>'}
                  <p>${escapeHtml(r.rule)}</p>
                </div>`,
            )
            .join("")}
        </div>`,
    )
    .join("");

  res.send(
    renderPage("Playbook", sections || `<div class="card"><p>No playbook rules yet.</p></div>`),
  );
});

// ── Connect ──────────────────────────────────────────────────────────

dashboardRouter.get("/connect", (req: Request, res: Response) => {
  const host = req.get("host") ?? "cursor-team-production.up.railway.app";
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const mcpUrl = `${protocol}://${host}/mcp`;
  const token = process.env.API_SECRET_TOKEN ?? "";

  const mcpConfig = token
    ? JSON.stringify(
        { mcpServers: { "cursor-team": { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      )
    : JSON.stringify(
        { mcpServers: { "cursor-team": { url: mcpUrl } } },
        null,
        2,
      );

  const mergeNote = `If you already have a <code>~/.cursor/mcp.json</code>, add the <code>"cursor-team"</code> entry inside your existing <code>"mcpServers"</code> object — don't replace the whole file.`;

  res.send(
    renderPage(
      "Connect",
      `
      <p style="color:var(--text-dim);margin-bottom:24px;">Connect any Cursor project to this team server. Choose one of the methods below.</p>

      <div class="card">
        <h3>Option 1 — One-liner (recommended)</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">
          Run this in your terminal. It creates <code>~/.cursor/mcp.json</code> if it doesn't exist,
          or merges the cursor-team entry into your existing config.
        </p>
        <div style="position:relative;">
          <pre id="install-cmd" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px 16px;font-size:13px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;line-height:1.5;">curl -sL ${protocol}://${host}/dashboard/connect/install | bash</pre>
          <button onclick="copyText('install-cmd')" style="position:absolute;top:8px;right:8px;background:var(--accent);color:white;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;">Copy</button>
        </div>
      </div>

      <div class="card">
        <h3>Option 2 — Manual config</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">
          Copy this JSON into <code>~/.cursor/mcp.json</code> (global, all projects) or <code>.cursor/mcp.json</code> in a specific project.
        </p>
        <p style="color:var(--amber);font-size:12px;margin-bottom:12px;">${mergeNote}</p>
        <div style="position:relative;">
          <pre id="mcp-config" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px 16px;font-size:13px;overflow-x:auto;white-space:pre;line-height:1.5;">${escapeHtml(mcpConfig)}</pre>
          <button onclick="copyText('mcp-config')" style="position:absolute;top:8px;right:8px;background:var(--accent);color:white;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;">Copy</button>
        </div>
      </div>

      <div class="card">
        <h3>After connecting</h3>
        <ol style="color:var(--text-dim);font-size:14px;line-height:2;padding-left:20px;">
          <li>Reload Cursor — <code>Cmd+Shift+P</code> → <strong>Reload Window</strong></li>
          <li>Open any project — the agent now has access to 12 team tools</li>
          <li>Try: <em>"Register this project with cursor-team"</em> or <em>"Search team memories for auth"</em></li>
        </ol>
      </div>

      <div class="card">
        <h3>Available tools</h3>
        <table>
          <thead><tr><th>Category</th><th>Tool</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>Memory</td><td><code>memory_store</code></td><td>Store a decision, pattern, lesson, or config</td></tr>
            <tr><td>Memory</td><td><code>memory_search</code></td><td>Semantic search across all team knowledge</td></tr>
            <tr><td>Memory</td><td><code>memory_list</code></td><td>List memories with filters</td></tr>
            <tr><td>Memory</td><td><code>memory_delete</code></td><td>Remove a memory</td></tr>
            <tr><td>Project</td><td><code>project_register</code></td><td>Register a new project with its tech stack</td></tr>
            <tr><td>Project</td><td><code>project_get</code></td><td>Get project details</td></tr>
            <tr><td>Project</td><td><code>project_list</code></td><td>List all registered projects</td></tr>
            <tr><td>Playbook</td><td><code>playbook_get</code></td><td>Get rules for a team member role</td></tr>
            <tr><td>Playbook</td><td><code>playbook_update</code></td><td>Update a role's playbook rules</td></tr>
            <tr><td>Bootstrap</td><td><code>team_bootstrap</code></td><td>Load full team context for a project</td></tr>
            <tr><td>Bootstrap</td><td><code>team_stats</code></td><td>Get team-wide statistics</td></tr>
          </tbody>
        </table>
      </div>

      <script>
        function copyText(id) {
          const el = document.getElementById(id);
          navigator.clipboard.writeText(el.textContent).then(() => {
            const btn = el.parentElement.querySelector('button');
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 2000);
          });
        }
      </script>
      `,
    ),
  );
});

dashboardRouter.get("/connect/install", (req: Request, res: Response) => {
  const host = req.get("host") ?? "cursor-team-production.up.railway.app";
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const mcpUrl = `${protocol}://${host}/mcp`;
  const token = process.env.API_SECRET_TOKEN ?? "";

  const serverEntry = token
    ? `{ "url": "${mcpUrl}", "headers": { "Authorization": "Bearer ${token}" } }`
    : `{ "url": "${mcpUrl}" }`;

  const script = `#!/bin/bash
set -e

CONFIG="$HOME/.cursor/mcp.json"
mkdir -p "$HOME/.cursor"

if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" << 'ENDCONFIG'
{
  "mcpServers": {
    "cursor-team": ${serverEntry}
  }
}
ENDCONFIG
  echo "✓ Created $CONFIG with cursor-team server"
else
  if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open('$CONFIG', 'r') as f:
    cfg = json.load(f)
cfg.setdefault('mcpServers', {})
cfg['mcpServers']['cursor-team'] = json.loads('${serverEntry.replace(/'/g, "\\'")}')
with open('$CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
print('✓ Added cursor-team to existing', '$CONFIG')
"
  elif command -v node &>/dev/null; then
    node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers['cursor-team'] = JSON.parse('${serverEntry.replace(/'/g, "\\'")}');
fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2));
console.log('✓ Added cursor-team to existing', '$CONFIG');
"
  else
    echo "⚠  $CONFIG already exists. Please add cursor-team manually."
    echo "   Entry to add inside mcpServers:"
    echo '   "cursor-team": ${serverEntry}'
    exit 1
  fi
fi

echo ""
echo "Next: Reload Cursor (Cmd+Shift+P → Reload Window)"
echo "Then try: \\"Register this project with cursor-team\\""
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(script);
});

// ── Settings (admin only) ────────────────────────────────────────────

dashboardRouter.get("/settings", async (_req: Request, res: Response) => {
  const current = (res.locals as DashboardLocals).dashboardUser;
  if (current.role !== "admin") {
    res.status(403).send(renderPage("Settings", `<div class="card"><p>Only admins can access settings.</p></div>`));
    return;
  }

  const users = await prisma.dashboardUser.findMany({
    orderBy: { createdAt: "asc" },
  });

  const message = (res.locals as Record<string, unknown>).flashMessage as string | undefined;

  const rows = users
    .map(
      (u) =>
        `<tr>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.name ?? "—")}</td>
          <td><span class="badge badge-${u.role === "admin" ? "decision" : "pattern"}">${u.role}</span></td>
          <td>${u.clerkId ? "Signed in" : "Invited"}</td>
          <td>${timeAgo(u.createdAt)}</td>
          <td>${u.id !== current.id
            ? `<form method="POST" action="/dashboard/settings/remove" style="display:inline;">
                <input type="hidden" name="userId" value="${u.id}" />
                <button type="submit" style="background:none;border:none;color:var(--rose);cursor:pointer;font-size:13px;">Remove</button>
              </form>`
            : '<span style="color:var(--text-dim);">You</span>'
          }</td>
        </tr>`,
    )
    .join("");

  res.send(
    renderPage(
      "Settings",
      `
      ${message ? `<div class="card" style="border-color:var(--accent);margin-bottom:16px;"><p>${message}</p></div>` : ""}
      <div class="card">
        <h3>Add Team Member</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">They'll be able to sign in with this email via Clerk.</p>
        <form method="POST" action="/dashboard/settings/add" style="display:flex;gap:8px;align-items:center;">
          <input type="email" name="email" placeholder="colleague@company.com" required
            style="flex:1;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;" />
          <select name="role" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Add</button>
        </form>
      </div>
      <h2>Users (${users.length})</h2>
      <table>
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      `,
    ),
  );
});

dashboardRouter.post("/settings/add", async (req: Request, res: Response) => {
  const current = (res.locals as DashboardLocals).dashboardUser;
  if (current.role !== "admin") {
    res.status(403).send("Forbidden");
    return;
  }

  const email = (req.body.email as string)?.trim().toLowerCase();
  const role = req.body.role === "admin" ? "admin" : "member";

  if (!email) {
    res.redirect("/dashboard/settings");
    return;
  }

  const existing = await prisma.dashboardUser.findUnique({ where: { email } });
  if (existing) {
    res.redirect("/dashboard/settings");
    return;
  }

  await prisma.dashboardUser.create({
    data: { email, role },
  });

  res.redirect("/dashboard/settings");
});

dashboardRouter.post("/settings/remove", async (req: Request, res: Response) => {
  const current = (res.locals as DashboardLocals).dashboardUser;
  if (current.role !== "admin") {
    res.status(403).send("Forbidden");
    return;
  }

  const userId = req.body.userId as string;

  if (userId === current.id) {
    res.redirect("/dashboard/settings");
    return;
  }

  await prisma.dashboardUser.delete({ where: { id: userId } }).catch(() => {});
  res.redirect("/dashboard/settings");
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
