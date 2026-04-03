import express, { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { TEAM_MEMBERS } from "../types.js";
import { renderPage } from "./render.js";
import type { DashboardLocals } from "./access.js";

export const dashboardRouter = Router();
dashboardRouter.use(express.urlencoded({ extended: false }));

function getLocals(res: Response): DashboardLocals {
  return res.locals as unknown as DashboardLocals;
}

// ── Overview ─────────────────────────────────────────────────────────

dashboardRouter.get("/", async (_req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const totalMemories = await prisma.memory.count({ where: { organizationId } });
  const totalProjects = await prisma.project.count({ where: { organizationId } });
  const totalPlaybook = await prisma.playbook.count({ where: { organizationId } });
  const totalActivities = await prisma.activity.count({ where: { organizationId } });

  const byType = await prisma.memory.groupBy({ by: ["type"], where: { organizationId }, _count: true });
  const byAuthor = await prisma.memory.groupBy({ by: ["author"], where: { organizationId }, _count: true });

  const recentMemories = await prisma.memory.findMany({
    where: { organizationId },
    include: {
      project: { select: { name: true } },
      contributor: { select: { name: true } },
    },
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
          <td>${m.contributor?.name ?? "—"}</td>
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
        <div class="stat-card stat-primary"><span class="stat-value">${totalActivities}</span><span class="stat-label">Activities</span></div>
      </div>

      <h2>By Type</h2>
      <div class="stats-row">${typeCards || "<p>No memories yet.</p>"}</div>

      <h2>By Team Member</h2>
      <div class="stats-row">${authorCards || "<p>No memories yet.</p>"}</div>

      <h2>Recent Activity</h2>
      <table>
        <thead><tr><th>Type</th><th>Agent</th><th>Contributor</th><th>Project</th><th>Content</th><th>When</th></tr></thead>
        <tbody>${recentRows || "<tr><td colspan='6'>No activity yet.</td></tr>"}</tbody>
      </table>
    `,
    ),
  );
});

// ── Projects ─────────────────────────────────────────────────────────

dashboardRouter.get("/projects", async (_req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: {
      _count: { select: { memories: true, playbook: true, assignments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const cards = projects
    .map(
      (p) =>
        `<div class="card">
          <h3>${p.name} <span class="badge badge-${p.status}">${p.status}</span></h3>
          <p class="stack">${p.stack.map((s) => `<span class="tag">${s}</span>`).join(" ")}</p>
          <p>${p.description ?? "<em>No description</em>"}</p>
          <div class="stats-row">
            <div class="stat-card"><span class="stat-value">${p._count.memories}</span><span class="stat-label">memories</span></div>
            <div class="stat-card"><span class="stat-value">${p._count.playbook}</span><span class="stat-label">rules</span></div>
            <div class="stat-card"><span class="stat-value">${p._count.assignments}</span><span class="stat-label">contributors</span></div>
          </div>
        </div>`,
    )
    .join("");

  res.send(
    renderPage("Projects", cards || `<div class="card"><p>No projects registered yet.</p></div>`),
  );
});

// ── Team ─────────────────────────────────────────────────────────────

dashboardRouter.get("/team", async (_req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const byAuthor = await prisma.memory.groupBy({
    by: ["author"],
    where: { organizationId },
    _count: true,
  });
  const authorMap = Object.fromEntries(byAuthor.map((a) => [a.author, a._count]));

  const agentCards = Object.entries(TEAM_MEMBERS)
    .map(
      ([id, member]) =>
        `<a href="/dashboard/team/${id}" class="agent-card">
          <div class="agent-avatar" style="background:${member.color}">${member.avatar}</div>
          <div class="agent-name">${member.name}</div>
          <div class="agent-role">${member.role}</div>
          <div class="agent-expertise">
            ${member.expertise.map((e) => `<span class="tag">${e}</span>`).join("")}
          </div>
          <div class="agent-stat"><strong>${authorMap[id] ?? 0}</strong> memories</div>
        </a>`,
    )
    .join("");

  const members = await prisma.orgMember.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const memberRows = members
    .map(
      (m) =>
        `<tr>
          <td>${escapeHtml(m.user.name ?? "—")}</td>
          <td>${escapeHtml(m.user.email)}</td>
          <td><span class="badge badge-${m.role}">${m.role}</span></td>
          <td>${timeAgo(m.joinedAt)}</td>
        </tr>`,
    )
    .join("");

  res.send(
    renderPage(
      "Team",
      `
      <h2>AI Agents</h2>
      <div class="agent-grid">${agentCards}</div>

      <h2>People</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>${memberRows || "<tr><td colspan='4'>No members yet.</td></tr>"}</tbody>
      </table>
    `,
    ),
  );
});

// ── Agent Detail ─────────────────────────────────────────────────────

dashboardRouter.get("/team/:agentId", async (req: Request, res: Response) => {
  const { organizationId } = getLocals(res);
  const agentId = String(req.params.agentId);
  const member = TEAM_MEMBERS[agentId];

  if (!member) {
    res.status(404).send(renderPage("Not Found", `<div class="card"><p>Agent not found.</p></div>`));
    return;
  }

  const [globalMemories, projectMemories, playbookRules] = await Promise.all([
    prisma.memory.findMany({
      where: {
        organizationId,
        author: agentId,
        projectId: null,
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.memory.findMany({
      where: {
        organizationId,
        author: agentId,
        projectId: { not: null },
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.playbook.findMany({
      where: { organizationId, role: member.playbookRole },
      include: { project: { select: { name: true } } },
      orderBy: { version: "desc" },
    }),
  ]);

  const renderMemoryRows = (memories: typeof globalMemories) =>
    memories
      .map(
        (m) =>
          `<tr>
            <td><span class="badge badge-${m.type}">${m.type}</span></td>
            <td>${m.project?.name ?? "global"}</td>
            <td class="content-cell">${escapeHtml(m.content.substring(0, 200))}${m.content.length > 200 ? "…" : ""}</td>
            <td>${m.tags.map((t: string) => `<span class="tag">${t}</span>`).join(" ") || "—"}</td>
            <td>${timeAgo(m.createdAt)}</td>
          </tr>`,
      )
      .join("");

  const globalRules = playbookRules.filter((r) => !r.projectId);
  const projectRules = playbookRules.filter((r) => r.projectId);

  const renderRules = (rules: typeof playbookRules) =>
    rules
      .map(
        (r) =>
          `<div class="rule">
            <span class="badge">v${r.version}</span>
            ${r.project ? `<span class="tag">${r.project.name}</span>` : ""}
            <p>${escapeHtml(r.rule)}</p>
          </div>`,
      )
      .join("");

  res.send(
    renderPage(
      "Team",
      `
      <a href="/dashboard/team" class="back-link">← Back to Team</a>

      <div class="agent-header">
        <div class="agent-avatar" style="background:${member.color}">${member.avatar}</div>
        <div class="agent-header-info">
          <div class="agent-name">${member.name}</div>
          <div class="agent-role">${member.role}</div>
          <div class="agent-desc">${member.description}</div>
          <div class="agent-expertise">
            ${member.expertise.map((e: string) => `<span class="tag">${e}</span>`).join("")}
          </div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card"><span class="stat-value">${globalMemories.length}</span><span class="stat-label">Global memories</span></div>
        <div class="stat-card"><span class="stat-value">${projectMemories.length}</span><span class="stat-label">Project memories</span></div>
        <div class="stat-card"><span class="stat-value">${playbookRules.length}</span><span class="stat-label">Playbook rules</span></div>
      </div>

      ${globalRules.length > 0 ? `
      <div class="scope-section">
        <div class="scope-header">
          <div class="scope-dot" style="background:var(--green)"></div>
          <h2 style="margin:0;">Playbook — Global Rules</h2>
        </div>
        <div class="card">${renderRules(globalRules)}</div>
      </div>` : ""}

      ${projectRules.length > 0 ? `
      <div class="scope-section">
        <div class="scope-header">
          <div class="scope-dot" style="background:var(--amber)"></div>
          <h2 style="margin:0;">Playbook — Project Rules</h2>
        </div>
        <div class="card">${renderRules(projectRules)}</div>
      </div>` : ""}

      <div class="scope-section">
        <div class="scope-header">
          <div class="scope-dot" style="background:var(--green)"></div>
          <h2 style="margin:0;">Global Memories</h2>
        </div>
        ${globalMemories.length > 0 ? `
        <table>
          <thead><tr><th>Type</th><th>Scope</th><th>Content</th><th>Tags</th><th>When</th></tr></thead>
          <tbody>${renderMemoryRows(globalMemories)}</tbody>
        </table>` : `<div class="card"><p style="color:var(--text-dim)">No global memories yet.</p></div>`}
      </div>

      <div class="scope-section">
        <div class="scope-header">
          <div class="scope-dot" style="background:var(--amber)"></div>
          <h2 style="margin:0;">Project-Specific Memories</h2>
        </div>
        ${projectMemories.length > 0 ? `
        <table>
          <thead><tr><th>Type</th><th>Project</th><th>Content</th><th>Tags</th><th>When</th></tr></thead>
          <tbody>${renderMemoryRows(projectMemories)}</tbody>
        </table>` : `<div class="card"><p style="color:var(--text-dim)">No project-specific memories yet.</p></div>`}
      </div>
    `,
    ),
  );
});

// ── Memories ─────────────────────────────────────────────────────────

dashboardRouter.get("/memories", async (req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const type = req.query.type as string | undefined;
  const author = req.query.author as string | undefined;
  const project = req.query.project as string | undefined;
  const page = parseInt((req.query.page as string) ?? "1", 10);
  const perPage = 20;

  const where: Record<string, unknown> = { organizationId };
  if (type) where.type = type;
  if (author) where.author = author;
  if (project) where.project = { name: project, organizationId };

  const [memories, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      include: {
        project: { select: { name: true } },
        contributor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
    }),
    prisma.memory.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  const filters = `
    <div class="filters">
      <select onchange="applyFilter('type', this.value)">
        <option value="">All types</option>
        ${["decision", "pattern", "lesson", "prompt", "review", "debug", "config"]
          .map((t) => `<option value="${t}" ${type === t ? "selected" : ""}>${t}</option>`)
          .join("")}
      </select>
      <select onchange="applyFilter('author', this.value)">
        <option value="">All agents</option>
        ${Object.keys(TEAM_MEMBERS)
          .map((a) => `<option value="${a}" ${author === a ? "selected" : ""}>${a}</option>`)
          .join("")}
      </select>
      <select onchange="applyFilter('project', this.value)">
        <option value="">All projects</option>
        ${projects.map((p) => `<option value="${p.name}" ${project === p.name ? "selected" : ""}>${p.name}</option>`).join("")}
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
          <td>${m.contributor?.name ?? "—"}</td>
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
          ${page > 1 ? `<a href="?page=${page - 1}${type ? `&type=${type}` : ""}${author ? `&author=${author}` : ""}${project ? `&project=${project}` : ""}">← Prev</a>` : ""}
          <span>Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<a href="?page=${page + 1}${type ? `&type=${type}` : ""}${author ? `&author=${author}` : ""}${project ? `&project=${project}` : ""}">Next →</a>` : ""}
        </div>`
      : "";

  res.send(
    renderPage(
      "Memories",
      `
      ${filters}
      <table>
        <thead><tr><th>Type</th><th>Agent</th><th>Contributor</th><th>Project</th><th>Tags</th><th>Content</th><th>Conf.</th><th>When</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='8'>No memories found.</td></tr>"}</tbody>
      </table>
      ${pagination}
    `,
    ),
  );
});

// ── Activity ─────────────────────────────────────────────────────────

dashboardRouter.get("/activity", async (req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const page = parseInt((req.query.page as string) ?? "1", 10);
  const perPage = 30;

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where: { organizationId },
      include: {
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
    }),
    prisma.activity.count({ where: { organizationId } }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const rows = activities
    .map(
      (a) =>
        `<tr>
          <td>${a.action}</td>
          <td>${a.user?.name ?? a.user?.email ?? "—"}</td>
          <td>${a.agentRole ?? "—"}</td>
          <td>${a.project?.name ?? "—"}</td>
          <td>${timeAgo(a.createdAt)}</td>
        </tr>`,
    )
    .join("");

  const pagination =
    totalPages > 1
      ? `<div class="pagination">
          ${page > 1 ? `<a href="?page=${page - 1}">← Prev</a>` : ""}
          <span>Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<a href="?page=${page + 1}">Next →</a>` : ""}
        </div>`
      : "";

  res.send(
    renderPage(
      "Activity",
      `
      <p style="color:var(--text-dim);margin-bottom:16px;">Every MCP tool call is logged here — who did what, when.</p>
      <table>
        <thead><tr><th>Action</th><th>User</th><th>Agent</th><th>Project</th><th>When</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='5'>No activity yet.</td></tr>"}</tbody>
      </table>
      ${pagination}
    `,
    ),
  );
});

// ── Playbook ─────────────────────────────────────────────────────────

dashboardRouter.get("/playbook", async (_req: Request, res: Response) => {
  const { organizationId } = getLocals(res);

  const rules = await prisma.playbook.findMany({
    where: { organizationId },
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

dashboardRouter.get("/connect", async (req: Request, res: Response) => {
  const { organizationId, user } = getLocals(res);
  const host = req.get("host") ?? "cursor-team-production.up.railway.app";
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const mcpUrl = `${protocol}://${host}/mcp`;

  const apiKeys = await prisma.apiKey.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const myKey = apiKeys.find((k) => k.userId === user.id);
  const token = myKey?.key ?? apiKeys[0]?.key ?? "";

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

  const keyRows = apiKeys
    .map(
      (k) =>
        `<tr>
          <td><code>${k.key.substring(0, 10)}…</code></td>
          <td>${k.label ?? "—"}</td>
          <td>${k.user?.name ?? k.user?.email ?? "org-level"}</td>
          <td>${k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}</td>
          <td>${timeAgo(k.createdAt)}</td>
        </tr>`,
    )
    .join("");

  res.send(
    renderPage(
      "Connect",
      `
      <p style="color:var(--text-dim);margin-bottom:24px;">Connect any Cursor project to this team server. Your personal API key is shown below.</p>

      <div class="card">
        <h3>Your MCP Config</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">
          Copy this JSON into <code>~/.cursor/mcp.json</code> (global) or <code>.cursor/mcp.json</code> (per project).
        </p>
        <div style="position:relative;">
          <pre id="mcp-config" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px 16px;font-size:13px;overflow-x:auto;white-space:pre;line-height:1.5;">${escapeHtml(mcpConfig)}</pre>
          <button onclick="copyText('mcp-config')" style="position:absolute;top:8px;right:8px;background:var(--accent);color:white;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;">Copy</button>
        </div>
      </div>

      <div class="card">
        <h3>After connecting</h3>
        <ol style="color:var(--text-dim);font-size:14px;line-height:2;padding-left:20px;">
          <li>Reload Cursor — <code>Cmd+Shift+P</code> → <strong>Reload Window</strong></li>
          <li>Open any project — the agent now has access to 14 team tools</li>
          <li>Try: <em>"Register this project with cursor-team"</em> or <em>"Search team memories for auth"</em></li>
        </ol>
      </div>

      <div class="card">
        <h3>API Keys</h3>
        <table>
          <thead><tr><th>Key</th><th>Label</th><th>User</th><th>Last Used</th><th>Created</th></tr></thead>
          <tbody>${keyRows || "<tr><td colspan='5'>No API keys.</td></tr>"}</tbody>
        </table>
        <form method="POST" action="/dashboard/connect/new-key" style="margin-top:12px;display:flex;gap:8px;align-items:center;">
          <input type="text" name="label" placeholder="Key label (optional)"
            style="flex:1;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;" />
          <button type="submit" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">Generate Key</button>
        </form>
      </div>

      <div class="card">
        <h3>Available tools (14)</h3>
        <table>
          <thead><tr><th>Category</th><th>Tool</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>Memory</td><td><code>memory_store</code></td><td>Store a decision, pattern, lesson, or config</td></tr>
            <tr><td>Memory</td><td><code>memory_search</code></td><td>Semantic search across all team knowledge</td></tr>
            <tr><td>Memory</td><td><code>memory_list</code></td><td>List memories with filters</td></tr>
            <tr><td>Memory</td><td><code>memory_delete</code></td><td>Remove a memory</td></tr>
            <tr><td>Project</td><td><code>project_register</code></td><td>Register a new project with its tech stack</td></tr>
            <tr><td>Project</td><td><code>project_get</code></td><td>Get project details and contributors</td></tr>
            <tr><td>Project</td><td><code>project_list</code></td><td>List all registered projects</td></tr>
            <tr><td>Handoff</td><td><code>project_handoff</code></td><td>Generate a full handoff briefing</td></tr>
            <tr><td>Handoff</td><td><code>project_onboard</code></td><td>Onboard onto a project</td></tr>
            <tr><td>Handoff</td><td><code>project_health</code></td><td>Check project documentation health</td></tr>
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

dashboardRouter.post("/connect/new-key", async (req: Request, res: Response) => {
  const { organizationId, user, orgMember } = getLocals(res);

  if (orgMember.role === "member") {
    res.redirect("/dashboard/connect");
    return;
  }

  const label = (req.body.label as string)?.trim() || null;
  const key = `ct_${generateKey()}`;

  await prisma.apiKey.create({
    data: {
      organizationId,
      userId: user.id,
      key,
      label,
    },
  });

  res.redirect("/dashboard/connect");
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

// ── Settings (admin/owner only) ──────────────────────────────────────

dashboardRouter.get("/settings", async (_req: Request, res: Response) => {
  const { organizationId, user, orgMember } = getLocals(res);

  if (orgMember.role === "member") {
    res.status(403).send(renderPage("Settings", `<div class="card"><p>Only admins can access settings.</p></div>`));
    return;
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  const members = await prisma.orgMember.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });

  const memberRows = members
    .map(
      (m) =>
        `<tr>
          <td>${escapeHtml(m.user.email)}</td>
          <td>${escapeHtml(m.user.name ?? "—")}</td>
          <td><span class="badge badge-${m.role}">${m.role}</span></td>
          <td>${m.user.clerkId ? "Signed in" : "Invited"}</td>
          <td>${timeAgo(m.joinedAt)}</td>
          <td>${m.userId !== user.id
            ? `<form method="POST" action="/dashboard/settings/remove" style="display:inline;">
                <input type="hidden" name="userId" value="${m.userId}" />
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
      <div class="card">
        <h3>Organization</h3>
        <p style="color:var(--text-dim);font-size:14px;">Name: <strong>${escapeHtml(org?.name ?? "—")}</strong></p>
        <p style="color:var(--text-dim);font-size:14px;">Slug: <code>${escapeHtml(org?.slug ?? "—")}</code></p>
      </div>

      <div class="card">
        <h3>Add Team Member</h3>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">They'll be able to sign in with this email via Clerk and access the dashboard.</p>
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
      <h2>Members (${members.length})</h2>
      <table>
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
      `,
    ),
  );
});

dashboardRouter.post("/settings/add", async (req: Request, res: Response) => {
  const { organizationId, orgMember } = getLocals(res);

  if (orgMember.role === "member") {
    res.status(403).send("Forbidden");
    return;
  }

  const email = (req.body.email as string)?.trim().toLowerCase();
  const role = req.body.role === "admin" ? "admin" : "member";

  if (!email) {
    res.redirect("/dashboard/settings");
    return;
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  const existingMember = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
  });

  if (!existingMember) {
    await prisma.orgMember.create({
      data: { organizationId, userId: user.id, role },
    });

    const key = `ct_${generateKey()}`;
    await prisma.apiKey.create({
      data: { organizationId, userId: user.id, key, label: "default" },
    });
  }

  res.redirect("/dashboard/settings");
});

dashboardRouter.post("/settings/remove", async (req: Request, res: Response) => {
  const { organizationId, user, orgMember } = getLocals(res);

  if (orgMember.role === "member") {
    res.status(403).send("Forbidden");
    return;
  }

  const userId = req.body.userId as string;

  if (userId === user.id) {
    res.redirect("/dashboard/settings");
    return;
  }

  await prisma.orgMember.deleteMany({
    where: { organizationId, userId },
  });

  res.redirect("/dashboard/settings");
});

// ── Helpers ──────────────────────────────────────────────────────────

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

function generateKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    result += chars[b % chars.length];
  }
  return result;
}
