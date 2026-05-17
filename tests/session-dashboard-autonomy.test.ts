import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { updateState } from "../extensions/choco-autopilot/index";
import { autonomyProtocolKey, createAutonomyProtocol, markProtocolToolSatisfied } from "../extensions/choco-autopilot/autonomy-protocol";
import { formatSessionDashboard } from "../extensions/choco-autopilot/session-dashboard";
import { sessionScopedKey } from "../extensions/choco-autopilot/session-scope";
import { createGitFixture } from "./helpers/git-fixture";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-session-autonomy-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

describe("/sessions autonomy visibility", () => {
  it("formats autonomy protocol and active lane summaries", () => {
    const text = formatSessionDashboard({
      sessionId: "s1",
      cwd: "/repo",
      branch: "main",
      mode: "default",
      todos: "none",
      ledger: "none",
      autonomy: {
        protocol: "parallel-work",
        required: ["spec_gate", "parallel_work_plan", "integration_verifier"],
        satisfied: ["spec_gate"],
        missing: ["parallel_work_plan", "integration_verifier"],
      },
      activeLane: {
        groupId: "group-a",
        laneId: "lane-1",
        readOnly: false,
      },
    });

    expect(text).toContain("autonomy:");
    expect(text).toContain("protocol: parallel-work");
    expect(text).toContain("missing: parallel_work_plan, integration_verifier");
    expect(text).toContain("active lane:");
    expect(text).toContain("laneId: lane-1");
  });

  it("shows persisted active protocol, missing tools, active lane, and actual mode", async () => {
    const cwd = await useTempAgentDir();
    const { commands } = createPiExtensionFixture(chocoAutopilot);
    const notify = vi.fn();
    const protocol = markProtocolToolSatisfied(createAutonomyProtocol({
      kind: "parallel-work",
      sessionId: "s1",
      cwd,
      prompt: "병렬로 구현해줘",
      requiredTools: ["spec_gate", "parallel_work_plan", "integration_verifier"],
      reason: "parallel intent",
    }), "spec_gate");

    await updateState((state) => {
      state.sessions.s1 = {
        effectiveWorkMode: "coding",
        automaticMode: true,
        executionIntensity: "deep",
        updatedAt: "2026-05-17T00:00:00.000Z",
      };
      state.autonomyProtocols[autonomyProtocolKey(cwd, "s1")] = protocol;
      state.activeLanes[sessionScopedKey(cwd, "s1")] = {
        version: 1,
        sessionId: "s1",
        cwd,
        groupId: "group-a",
        laneId: "lane-1",
        repoRoot: cwd,
        ownedFiles: ["tests/"],
        ownedDomains: [],
        executionStrategy: "worktree",
        readOnly: false,
        activatedAt: "2026-05-17T00:00:00.000Z",
      };
    });

    await commands.get("sessions")!.handler("", { cwd, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

    const output = notify.mock.calls[0][0] as string;
    expect(output).toContain("mode: default->coding/deep");
    expect(output).toContain("protocol: parallel-work");
    expect(output).toContain("satisfied: spec_gate");
    expect(output).toContain("missing: parallel_work_plan, integration_verifier");
    expect(output).toContain("active lane:");
    expect(output).toContain("groupId: group-a");
  });

  it("shows repo-root manifests even when /sessions is run from a repository subdirectory", async () => {
    const fixture = await createGitFixture();
    try {
      await useTempAgentDir();
      const { commands } = createPiExtensionFixture(chocoAutopilot);
      const notify = vi.fn();
      const manifestDir = join(fixture.repoRoot, ".pi", "agent-runs", "group-a");
      const subdir = join(fixture.repoRoot, "packages", "app");
      await mkdir(manifestDir, { recursive: true });
      await mkdir(subdir, { recursive: true });
      await writeFile(join(manifestDir, "manifest.json"), JSON.stringify({
        version: 1,
        groupId: "group-a",
        repoRoot: fixture.repoRoot,
        baseRef: "main",
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        parallelStrategy: "hybrid",
        status: "running",
        lanes: [],
      }, null, 2));

      await commands.get("sessions")!.handler("", { cwd: subdir, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

      const output = notify.mock.calls[0][0] as string;
      expect(output).toContain("Agent run group-a [running]");
    } finally {
      await fixture.cleanup();
    }
  });

  it("shows autonomy none when no protocol exists", () => {
    const text = formatSessionDashboard({ sessionId: "s1", cwd: "/repo", autonomy: undefined });

    expect(text).toContain("autonomy:");
    expect(text).toContain("protocol: none");
  });
});
