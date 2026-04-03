export function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Cursor Team</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --border: #1e1e2e;
      --text: #e0e0e8;
      --text-dim: #7a7a8e;
      --accent: #8b5cf6;
      --accent-dim: #6d28d9;
      --green: #22c55e;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --cyan: #06b6d4;
      --blue: #3b82f6;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }

    .layout {
      display: flex;
      min-height: 100vh;
    }

    nav {
      width: 220px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 24px 16px;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    nav .logo {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 32px;
      letter-spacing: -0.5px;
    }

    nav a {
      display: block;
      padding: 8px 12px;
      color: var(--text-dim);
      text-decoration: none;
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 14px;
      transition: all 0.15s;
    }

    nav a:hover, nav a.active {
      background: var(--border);
      color: var(--text);
    }

    main {
      margin-left: 220px;
      padding: 32px 40px;
      flex: 1;
      max-width: 1200px;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }

    h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 24px 0 12px;
      color: var(--text-dim);
    }

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .stats-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      min-width: 120px;
    }

    .stat-card.stat-primary {
      border-color: var(--accent-dim);
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--accent);
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-dim);
      text-transform: capitalize;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    th, td {
      padding: 10px 14px;
      text-align: left;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }

    th {
      background: var(--border);
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }

    .content-cell {
      max-width: 400px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge-decision { background: #6d28d920; color: var(--accent); }
    .badge-pattern { background: #3b82f620; color: var(--blue); }
    .badge-lesson { background: #f59e0b20; color: var(--amber); }
    .badge-prompt { background: #22c55e20; color: var(--green); }
    .badge-review { background: #f43f5e20; color: var(--rose); }
    .badge-debug { background: #06b6d420; color: var(--cyan); }
    .badge-config { background: #7a7a8e20; color: var(--text-dim); }

    .badge-active { background: #22c55e20; color: var(--green); }
    .badge-archived { background: #7a7a8e20; color: var(--text-dim); }
    .badge-handoff { background: #f59e0b20; color: var(--amber); }

    .badge-owner { background: #6d28d920; color: var(--accent); }
    .badge-admin { background: #3b82f620; color: var(--blue); }
    .badge-member { background: #7a7a8e20; color: var(--text-dim); }

    .tag {
      display: inline-block;
      padding: 2px 8px;
      background: var(--border);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-dim);
      margin: 2px;
    }

    .stack { margin-bottom: 8px; }
    .role { color: var(--text-dim); margin-bottom: 12px; }

    .rule {
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .rule p { margin-top: 8px; font-size: 14px; }

    .filters {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 14px;
    }

    .pagination {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 16px;
      font-size: 14px;
    }

    .pagination a {
      color: var(--accent);
      text-decoration: none;
    }

    .pagination a:hover { text-decoration: underline; }

    code {
      background: var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }

    /* Agent cards */
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .agent-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      text-decoration: none;
      color: var(--text);
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      cursor: pointer;
    }

    .agent-card:hover {
      border-color: var(--accent-dim);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }

    .agent-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 700;
      color: white;
      margin-bottom: 14px;
      flex-shrink: 0;
    }

    .agent-card .agent-name {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .agent-card .agent-role {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 12px;
    }

    .agent-card .agent-expertise {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: center;
      margin-bottom: 14px;
    }

    .agent-card .agent-expertise .tag {
      font-size: 11px;
      padding: 2px 6px;
    }

    .agent-card .agent-stat {
      font-size: 13px;
      color: var(--text-dim);
    }

    .agent-card .agent-stat strong {
      color: var(--accent);
      font-weight: 700;
    }

    /* Agent detail page */
    .agent-header {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 32px;
    }

    .agent-header .agent-avatar {
      width: 80px;
      height: 80px;
      font-size: 34px;
      margin-bottom: 0;
    }

    .agent-header-info .agent-name {
      font-size: 24px;
      font-weight: 700;
    }

    .agent-header-info .agent-role {
      font-size: 15px;
      color: var(--text-dim);
      margin-bottom: 6px;
    }

    .agent-header-info .agent-desc {
      font-size: 14px;
      color: var(--text-dim);
      line-height: 1.5;
      max-width: 600px;
    }

    .agent-header-info .agent-expertise {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    .scope-section {
      margin-bottom: 24px;
    }

    .scope-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .scope-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text-dim);
      text-decoration: none;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .back-link:hover { color: var(--text); }

    @media (max-width: 768px) {
      nav { display: none; }
      main { margin-left: 0; padding: 16px; }
      .agent-header { flex-direction: column; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <div class="logo">Cursor Team</div>
      <a href="/dashboard" class="${title === "Overview" ? "active" : ""}">Overview</a>
      <a href="/dashboard/projects" class="${title === "Projects" ? "active" : ""}">Projects</a>
      <a href="/dashboard/team" class="${title === "Team" ? "active" : ""}">Team</a>
      <a href="/dashboard/memories" class="${title === "Memories" ? "active" : ""}">Memories</a>
      <a href="/dashboard/activity" class="${title === "Activity" ? "active" : ""}">Activity</a>
      <a href="/dashboard/playbook" class="${title === "Playbook" ? "active" : ""}">Playbook</a>
      <a href="/dashboard/connect" class="${title === "Connect" ? "active" : ""}">Connect</a>
      <a href="/dashboard/settings" class="${title === "Settings" ? "active" : ""}">Settings</a>
      <a href="/sign-out" style="margin-top: auto; color: var(--rose);">Sign Out</a>
    </nav>
    <main>
      <h1>${title}</h1>
      ${body}
    </main>
  </div>
</body>
</html>`;
}
