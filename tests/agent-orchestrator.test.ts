import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { runAgentOrchestrator, type ActiveLaneContext } from "../extensions/choco-autopilot/agent-orchestrator-tool";
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

function captureActiveLaneStore() {
  const activations: ActiveLaneContext[] = [];
  return {
    activations,
    store: {
      async activate(_sessionId: string, _cwd: string, context: ActiveLaneContext): Promise<void> {
        activations.push(context);
      },
      async deactivate(): Promise<void> {},
    },
  };
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

  it("blocks serial lanes from parallel handoff dispatch", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "unknown", description: "Unknown writable scope" }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    const result = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });

    expect(result.ok).toBe(false);
    expect(result.blockers.join("\n")).toContain("serial lane cannot be dispatched as a parallel handoff");
  });

  it("marks dispatchable lanes dispatched so repeated dispatch does not duplicate handoffs", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    const first = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });
    const second = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });
    const manifest = await loadAgentRunManifest(root, "group-a");

    expect(first.ok).toBe(true);
    expect(first.handoffPrompts).toHaveLength(1);
    expect(manifest.status).toBe("dispatching");
    expect(manifest.lanes[0].status).toBe("dispatched");
    expect(second.ok).toBe(true);
    expect(second.handoffPrompts).toEqual([]);
  });

  it("allows mark_running from dispatched lanes", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });

    const result = await runAgentOrchestrator({ action: "mark_running", repoRoot: root, groupId: "group-a", laneId: "lane-1" });
    const manifest = await loadAgentRunManifest(root, "group-a");

    expect(result.ok).toBe(true);
    expect(manifest.lanes[0].status).toBe("running");
  });

  it("dispatches read-only lanes with a handoff prompt", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    const result = await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });

    expect(result.ok).toBe(true);
    expect(result.handoffPrompts.join("\n")).toContain("lane-1");
    expect(result.handoffPrompts.join("\n")).toContain("Review docs");
    expect(result.handoffPrompts.join("\n")).toContain("CHOCO_PI_ACTIVE_LANE_CONTEXT");
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
    expect(manifest.lanes[0].verificationEvidence).toBe("pnpm test passed");
    expect(manifest.lanes[0].verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(verified.summary).toContain("pnpm test passed");
  });

  it("blocks activation of planned writable lanes and lanes without required worktree paths", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/runtime.ts"] }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    const { activations, store } = captureActiveLaneStore();

    const planned = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);
    await updateAgentLaneStatus(root, "group-a", "lane-1", "created");
    const missingPath = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);

    expect(planned.ok).toBe(false);
    expect(planned.blockers.join("\n")).toContain("planned lane cannot be activated");
    expect(missingPath.ok).toBe(false);
    expect(missingPath.blockers.join("\n")).toContain("writable worktree lane requires worktreePath");
    expect(activations).toEqual([]);
  });

  it("allows dispatched and running lanes but blocks verified lanes", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await runAgentOrchestrator({ action: "dispatch", repoRoot: root, groupId: "group-a" });
    const { activations, store } = captureActiveLaneStore();

    const dispatched = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);
    await updateAgentLaneStatus(root, "group-a", "lane-1", "running");
    const running = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);
    await updateAgentLaneStatus(root, "group-a", "lane-1", "verified", { verificationEvidence: "done" });
    const verified = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);

    expect(dispatched.ok).toBe(true);
    expect(running.ok).toBe(true);
    expect(verified.ok).toBe(false);
    expect(verified.blockers.join("\n")).toContain("verified lane cannot be activated");
    expect(activations).toHaveLength(2);
  });

  it("blocks activation of serial lanes", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "serial", description: "Unknown writable scope" }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    const { activations, store } = captureActiveLaneStore();

    const serial = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);

    expect(serial.ok).toBe(false);
    expect(serial.blockers.join("\n")).toContain("serial lane cannot be activated");
    expect(activations).toEqual([]);
  });

  it("allows read-only spawn lanes even before dispatch", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
    await runAgentOrchestrator({ action: "start", repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    const { activations, store } = captureActiveLaneStore();

    const result = await runAgentOrchestrator({ action: "activate_lane", repoRoot: root, groupId: "group-a", laneId: "lane-1" }, {}, store);

    expect(result.ok).toBe(true);
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({ laneId: "lane-1", readOnly: true, executionStrategy: "spawn-agent" });
  });
});
