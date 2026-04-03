export const TEAM_MEMBERS = {
  nizek: { name: "Nizek", role: "Team Builder" },
  alex: { name: "Alex", role: "PM / Roadmap" },
  sam: { name: "Sam", role: "Architect" },
  raya: { name: "Raya", role: "Reviewer" },
  omar: { name: "Omar", role: "Debugger" },
  dana: { name: "Dana", role: "Prompt Engineer" },
  kai: { name: "Kai", role: "DevOps" },
} as const;

export type TeamMemberId = keyof typeof TEAM_MEMBERS;

export const MEMORY_TYPES = [
  "decision",
  "pattern",
  "lesson",
  "prompt",
  "review",
  "debug",
  "config",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
