import { basename, join } from "node:path";
import { homedir } from "node:os";
import { normalizeSessionId } from "./session-scope";

export interface SessionWorktreePlanInput {
  repoRoot: string;
  sessionId: string;
  taskName?: string;
  homeDir?: string;
}

export interface SessionWorktreePlan {
  projectName: string;
  sessionId: string;
  slug: string;
  branchName: string;
  path: string;
}

function taskSlug(taskName: string | undefined): string {
  const expanded = (taskName || "work")
    .toLowerCase()
    .replace(/멀티/g, " multi ")
    .replace(/세션/g, " session ")
    .replace(/투두|할일/g, " todo ")
    .replace(/격리/g, " ");
  const words = expanded.match(/[a-z0-9]+/g)?.filter((word) => word.length > 1) ?? [];
  const unique = words.filter((word, index) => words.indexOf(word) === index).slice(0, 3);
  return unique.length ? unique.join("-") : "work";
}

export function planSessionWorktree(input: SessionWorktreePlanInput): SessionWorktreePlan {
  const projectName = basename(input.repoRoot.replace(/\/+$/, ""));
  const sessionId = normalizeSessionId(input.sessionId).slice(0, 12);
  const slug = taskSlug(input.taskName);
  return {
    projectName,
    sessionId,
    slug,
    branchName: `session/${sessionId}/${slug}`,
    path: join(input.homeDir ?? homedir(), ".config", "superpowers", "worktrees", projectName, `${sessionId}-${slug}`),
  };
}

export function buildWorktreeGuidance(): string {
  return [
    "### Multi-session worktree isolation",
    "- When the user asks for parallel or multi-session work, prefer isolated git worktrees instead of sharing one cwd.",
    "- Default local worktree root: ~/.config/superpowers/worktrees/<project>/<session>-<task>.",
    "- Keep each session's todos and ledger scoped to that session; use project-shared todos only when explicitly requested.",
    "- Do not delete worktrees or branches without an explicit irreversible-action approval boundary.",
  ].join("\n");
}
