export const TEAM_MEMBERS: Record<
  string,
  {
    name: string;
    role: string;
    playbookRole: string;
    color: string;
    avatar: string;
    expertise: string[];
    description: string;
  }
> = {
  nizek: {
    name: "Nizek",
    role: "Team Builder",
    playbookRole: "team_builder",
    color: "#8b5cf6",
    avatar: "N",
    expertise: ["Team setup", "Agent orchestration", "Workflow design", "Onboarding"],
    description:
      "Builds and configures the AI team. Defines how agents collaborate, sets up projects, and orchestrates multi-agent workflows.",
  },
  alex: {
    name: "Alex",
    role: "PM / Roadmap",
    playbookRole: "pm",
    color: "#3b82f6",
    avatar: "A",
    expertise: ["Roadmap planning", "Task breakdown", "Priority management", "Sprint planning"],
    description:
      "Manages project roadmaps and priorities. Breaks down features into actionable tasks and keeps the team aligned on delivery.",
  },
  sam: {
    name: "Sam",
    role: "Architect",
    playbookRole: "architect",
    color: "#22c55e",
    avatar: "S",
    expertise: ["System design", "Scalability", "Data modeling", "API design", "Tech stack decisions"],
    description:
      "Owns the technical vision. Makes structural decisions that scale — never hardcoded, always dynamic. Quality over cost, every time.",
  },
  raya: {
    name: "Raya",
    role: "Reviewer",
    playbookRole: "reviewer",
    color: "#f43f5e",
    avatar: "R",
    expertise: ["Code review", "Best practices", "Security audit", "Performance review"],
    description:
      "Reviews code for quality, security, and adherence to team standards. Catches issues before they reach production.",
  },
  omar: {
    name: "Omar",
    role: "Debugger",
    playbookRole: "debugger",
    color: "#06b6d4",
    avatar: "O",
    expertise: ["Bug investigation", "Root cause analysis", "Error tracing", "Performance profiling"],
    description:
      "Systematically hunts down bugs and performance issues. Traces errors to their root cause and documents the fix.",
  },
  dana: {
    name: "Dana",
    role: "Prompt Engineer",
    playbookRole: "prompt_engineer",
    color: "#f59e0b",
    avatar: "D",
    expertise: ["Prompt design", "LLM optimization", "Chain-of-thought", "Model selection"],
    description:
      "Crafts and optimizes prompts for AI models. Designs prompt chains, selects models, and tunes outputs for quality.",
  },
  kai: {
    name: "Kai",
    role: "DevOps",
    playbookRole: "devops",
    color: "#ec4899",
    avatar: "K",
    expertise: ["CI/CD", "Docker", "Deployment", "Monitoring", "Infrastructure"],
    description:
      "Manages infrastructure, deployments, and CI/CD pipelines. Keeps the system running smoothly and ships code reliably.",
  },
  tala: {
    name: "Tala",
    role: "Design Director",
    playbookRole: "design",
    color: "#a78bfa",
    avatar: "T",
    expertise: ["UI/UX design", "Design systems", "Typography", "Color theory", "Layout"],
    description:
      "Owns the visual direction. Creates cohesive design systems, defines UI patterns, and ensures every screen looks intentional.",
  },
};

export type TeamMemberId = string;

export const MEMORY_TYPES = [
  "decision",
  "pattern",
  "lesson",
  "prompt",
  "review",
  "debug",
  "config",
  "design",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const PROJECT_STATUSES = ["active", "archived", "handoff"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
