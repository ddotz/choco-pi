import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { runAgentOrchestrator } from "../extensions/choco-autopilot/agent-orchestrator-tool";
import { loadAgentRunManifest, updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

let repoRoot: string | undefined;

afterEach(async () => {
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  repoRoot = undefined;
});

async function tempRepoRoot(): Promise<string> {
  repoRoot = await mkdtemp(join(tmpdir(), "choco-pi-orchestrator-"));
  return repoRoot;
}

describe("agent orchestrator", () => {
  it("registers agent_orchestrator as a Pi-native tool", () => {
    const { tools } = createPiExtensionFixture(chocoAutopilot);

    expect(tools.has("agent_orchestrator")).toBe(true);
  });

  it("starts a manifest from a parallel plan and summarizes it", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ goal: "ship", items: [{ id: "docs", description: "Review docs", files: ["README.md"], write: false }] });

    const started = await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    const summary = await runAgentOrchestrator({ action: "summarize", repoRoot: root, groupId: "group-a" });

    expect(started.ok).toBe(true);
    expect(summary.ok).toBe(true);
    expect(summary.summary).toContain("group-a");
  });

  it("blocks dispatch for writable worktree lanes until a worktree exists", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/runtime.ts"] }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    const result = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });

    expect(result.ok).toBe(false);
    expect(result.blockers.join("\n")).toContain("writable lane requires worktreePath before dispatch");
  });

  it("dispatches read-only lanes with a handoff prompt", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    const result = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });

    expect(result.ok).toBe(true);
    expect(result.handoffPrompts.join("\n")).toContain("lane-1");
    expect(result.handoffPrompts.join("\n")).toContain("Review docs");
  });

  it("preserves existing lane verification commands when a later update omits them", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await updateAgentLaneStatus(root, "group-a", "lane-1", "created", { verificationCommands: ["pnpm test"] });

    const result = await runAgentOrchestrator({ action: "mark_running", repoRoot: root, groupId: "group-a", laneId: "lane-1" });
    const manifest = await loadAgentRunManifest(root, "group-a");

    expect(result.ok).toBe(true);
    expect(manifest.lanes[0].verificationCommands).toEqual(["pnpm test"]);
  });

  it("requires evidence before marking a lane verified", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await updateAgentLaneStatus(root, "group-a", "lane-1", "running");

    const blocked = await runAgentOrchestrator({ action: "mark_verified", repoRoot: root, groupId: "group-a", laneId: "lane-1" });
    const verified = await runAgentOrchestrator({ action: "mark_verified", repoRoot: root, groupId: "group-a", laneId: "lane-1", evidence: "pnpm test passed" });
    const manifest = await loadAgentRunManifest(root, "group-a");

    expect(blocked.ok).toBe(false);
    expect(blocked.blockers.join("\n")).toContain("evidence or verificationCommands is required");
    expect(verified.ok).toBe(true);
    expect(manifest.lanes[0].status).toBe("verified");
  });
});
