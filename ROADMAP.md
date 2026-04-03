# Team Intelligence Upgrade — Execution Plan

**Author:** Alex (PM)
**Date:** April 3, 2026
**Status:** Ready for execution

---

## Vision

A self-improving AI team where knowledge compounds across every project. No agent works in a silo. Every decision Sam makes, every bug Omar fixes, every pattern Raya flags — the entire team learns from it. The team gets smarter with every conversation.

## Current State

| Problem | Impact |
|---------|--------|
| 7 of 8 agents don't pull their playbook | Dashboard rules have zero effect on them |
| Every agent only searches their own memories | Omar never sees Sam's architecture decisions |
| Everything stored as project-specific | Universal lessons locked to one project, invisible elsewhere |
| 6 agents use wrong MCP server name | Their brain calls silently fail |
| No cross-agent awareness | Agents duplicate work or contradict each other |

## Desired State

- Every agent pulls their playbook rules on activation
- Every agent searches team-wide context before starting work
- Every agent classifies learnings as global vs project-specific
- Universal learnings get promoted to playbook rules automatically
- Cross-agent knowledge flows naturally (Omar sees Sam's decisions, Raya sees Omar's fixes)

---

## Phase 1: Cloud Brain v2 Protocol (Foundation)

**Goal:** Every agent follows the same standard protocol for connecting to the team brain.

**Architecture decision:** The protocol lives in ONE place — `.cursor/rules/cloud-brain-protocol.mdc` — as an always-apply Cursor rule. Every agent inherits it automatically. Individual SKILL.md files carry only identity and expertise, NOT the Cloud Brain protocol. This means:
- Update the protocol once → all agents get it
- Add a new agent → they inherit the protocol automatically
- No copy-paste, no drift between agents

**Tasks:**

- [x] Write `cloud-brain-protocol.mdc` as a single-source-of-truth Cursor rule
- [x] Fix role mapping (was completely wrong — roles were shuffled)
- [ ] Remove duplicate Cloud Brain sections from all 8 SKILL.md files (they now inherit from the rule)
- [ ] Fix MCP server name in any remaining SKILL.md references (`cursor-team` → `user-cursor-team`)
- [ ] Verify each agent's SKILL.md has their `playbookRole` declared so the rule can map it
- [ ] Test: activate an agent, verify playbook_get is called, verify team-wide search happens

---

## Phase 2: Seed the Playbook (Training)

**Goal:** Transfer the best practices from each SKILL.md into the cloud playbook so they become dynamic and editable from the dashboard.

**Why:** Right now the best rules live in static SKILL.md files. If you want to change how Raya reviews code, you have to edit a file on disk. After this phase, you update from the dashboard and it takes effect immediately.

**Tasks:**

- [ ] Extract Raya's top review rules → `playbook_update({ role: "reviewer", ... })`
- [ ] Extract Omar's debug protocol rules → `playbook_update({ role: "debugger", ... })`
- [ ] Extract Dana's prompt engineering rules → `playbook_update({ role: "prompt_engineer", ... })`
- [ ] Extract Kai's deployment rules → `playbook_update({ role: "devops", ... })`
- [ ] Extract Alex's planning rules → (already done, 1 rule exists)
- [ ] Extract Tala's design rules → `playbook_update({ role: "design", ... })`
- [ ] Extract Nizek's team building rules → `playbook_update({ role: "team_builder", ... })`
- [ ] Verify all roles show on dashboard playbook page

---

## Phase 3: Cross-Agent Awareness (Intelligence)

**Goal:** Each agent knows when another agent's knowledge is relevant and actively checks it.

**What:** Add role-specific guidance on WHOSE memories to check before starting work.

| Agent | Before starting, check... |
|-------|--------------------------|
| Omar (Debugger) | Sam's architecture decisions — the "bug" might be by design |
| Raya (Reviewer) | Sam's architecture decisions — don't flag intentional patterns as issues |
| Raya (Reviewer) | Omar's debug history — recurring bugs reveal systemic problems |
| Dana (Prompt Engineer) | Sam's model routing decisions — which models for which agents |
| Dana (Prompt Engineer) | Raya's review findings — prompt quality issues to avoid |
| Kai (DevOps) | Sam's architecture decisions — infrastructure must match architecture |
| Alex (PM) | All agents — need full picture for planning |
| Tala (Design) | Sam's architecture decisions — UI patterns must align with data model |
| Nizek (Team Builder) | All agents — team health requires full visibility |

**Tasks:**

- [ ] Add cross-agent search guidance to each SKILL.md
- [ ] Add "team awareness" section: who does what, when to consult
- [ ] Test: give Omar a debugging task, verify he checks Sam's decisions first

---

## Phase 4: Feedback Loops (Growth)

**Goal:** Knowledge flows back up. When any agent discovers something universal, it becomes a playbook rule that all future sessions benefit from.

**Mechanism:**

```
Agent does work
  → Learns something
    → Is it universal?
      YES → Store as global memory
          → Promote to playbook rule via playbook_update
          → Next time ANY agent activates, they pull it
      NO  → Store as project memory
          → Available to all agents on that project
```

**Tasks:**

- [ ] Verify the store-and-promote flow works end-to-end
- [ ] Test: Sam makes a global decision → Omar activates → sees it via playbook_get
- [ ] Test: Omar fixes a bug → stores as global → Raya sees it next review
- [ ] Add a "team" playbook role for rules that apply to ALL agents regardless of role

---

## Phase 5: Measure & Improve (Ongoing)

**Goal:** Track whether the team is actually getting smarter.

**Metrics (visible on dashboard):**

| Metric | Where to check |
|--------|---------------|
| Memories per agent | Dashboard → Overview → By Team Member |
| Global vs project split | Dashboard → Team → Agent detail page |
| Playbook rules per role | Dashboard → Playbook |
| Activity volume over time | Dashboard → Activity |

**Tasks:**

- [ ] Weekly: review which agents are storing memories and which aren't
- [ ] Monthly: review playbook rules — prune outdated ones, promote new learnings
- [ ] Per project: check that handoff captures all learnings before archiving

---

## Execution Order

| Order | Phase | Effort | Impact |
|-------|-------|--------|--------|
| 1 | Phase 1: Cloud Brain v2 | ~1 session | Unblocks everything — agents can finally talk to the brain |
| 2 | Phase 2: Seed Playbook | ~1 session | Dashboard becomes the control center |
| 3 | Phase 3: Cross-Agent Awareness | ~1 session | Team becomes collaborative, not siloed |
| 4 | Phase 4: Feedback Loops | ~30 min | Knowledge compounds automatically |
| 5 | Phase 5: Measure | Ongoing | Continuous improvement |

**Phases 1 + 2 can be done in one sitting.** They are the foundation — without them, nothing else works. Phase 3 builds on top. Phase 4 is small but powerful. Phase 5 is just discipline.

---

## Success Criteria

The upgrade is complete when:

1. Every agent pulls their playbook on activation — verified by checking activity logs
2. Every agent searches team-wide before starting work — no more `author` silos
3. Global decisions are visible from any project — verified on agent detail pages
4. A decision made by Sam in Project A is visible to Omar in Project B
5. The dashboard playbook page shows rules for all 8 roles
6. New playbook rules added from the dashboard take effect in the next agent session without touching any files
