import { describe, expect, it } from "vitest";
import {
  buildFooterLines,
  createRunStateSnapshot,
  formatModelLabel,
  formatPath,
  formatRateLimits,
  formatWorkModeLabel,
  parseClaudeHudCacheJson,
  parseClaudeStatuslineCache,
  selectCodexRateLimit,
  reduceRunState,
  resolveFooterBranch,
  summarizeTodosJson,
} from "../extensions/choco-footer/core";

const codexResponse = {
  rateLimits: {
    limitId: "codex",
    primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 111 },
    secondary: { usedPercent: 18, windowDurationMins: 10080, resetsAt: 222 },
  },
  rateLimitsByLimitId: {
    codex: {
      limitId: "codex",
      primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 111 },
      secondary: { usedPercent: 18, windowDurationMins: 10080, resetsAt: 222 },
    },
    codex_bengalfox: {
      limitId: "codex_bengalfox",
      limitName: "GPT-5.3-Codex-Spark",
      primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 333 },
      secondary: { usedPercent: 7, windowDurationMins: 10080, resetsAt: 444 },
    },
  },
};

describe("choco footer core", () => {
  it("formats branch version, effective mode, intensity, and run state on the first line", () => {
    const lines = buildFooterLines({
      modelLabel: "GPT-5.5 Codex",
      branch: "main",
      cwd: "~/.pi/agent",
      thinkingLevel: "xhigh",
      appVersion: "0.1.2",
      modeLabel: formatWorkModeLabel({ persistentMode: "default", effectiveMode: "report", executionIntensity: "standard", automaticMode: true }),
      rateLimitText: "5h:1% wk:18%",
      contextText: "0.8%",
      costText: "$0.01",
      toolCount: 4,
      todoLabel: "1/3",
      runStateLabel: "Ready",
    });

    expect(lines).toEqual([
      "GPT-5.5 Codex | ⎇ main v0.1.2 | ~/.pi/agent | ◉ xhigh | Ready",
      "  default->report/standard auto | 5h:1% wk:18% | ctx 0.8% | $0.01 | tools:4 | todo 1/3",
    ]);
  });

  it("falls back to git branch data when Pi footer branch data is missing", () => {
    const branch = resolveFooterBranch(null, null, "main");
    const lines = buildFooterLines({
      modelLabel: "GPT-5.5 Codex",
      branch,
      cwd: "~/code/choco-pi",
      thinkingLevel: "xhigh",
      appVersion: "0.1.6",
      modeLabel: "default",
      rateLimitText: "5h:1% wk:18%",
      contextText: "0.8%",
      costText: "$0.01",
      toolCount: 4,
      todoLabel: "0/0",
      runStateLabel: "Ready",
    });

    expect(branch).toBe("main");
    expect(lines[0]).toContain("⎇ main v0.1.6");
  });

  it("tracks Codex-style run-state transitions", () => {
    let state = createRunStateSnapshot();
    expect(state.label).toBe("Starting");

    state = reduceRunState(state, "session_ready");
    expect(state).toMatchObject({ label: "Ready", activeTools: 0 });

    state = reduceRunState(state, "before_agent_start");
    expect(state).toMatchObject({ label: "Starting", activeTools: 0 });

    state = reduceRunState(state, "turn_start");
    expect(state).toMatchObject({ label: "Thinking", activeTools: 0 });

    state = reduceRunState(state, "tool_execution_start");
    state = reduceRunState(state, "tool_execution_start");
    expect(state).toMatchObject({ label: "Working", activeTools: 2 });

    state = reduceRunState(state, "tool_execution_end");
    expect(state).toMatchObject({ label: "Working", activeTools: 1 });

    state = reduceRunState(state, "tool_execution_end");
    expect(state).toMatchObject({ label: "Thinking", activeTools: 0 });

    state = reduceRunState(state, "agent_end");
    expect(state).toMatchObject({ label: "Ready", activeTools: 0 });
  });

  it("keeps existing footer parsing behavior", () => {
    expect(parseClaudeStatuslineCache("UTILIZATION=0\nWEEKLY_UTILIZATION=23\n")?.secondary?.usedPercent).toBe(23);
    expect(parseClaudeHudCacheJson(JSON.stringify({ data: { fiveHour: 4, weekly: 29 } }))?.primary?.usedPercent).toBe(4);
    expect(formatRateLimits(selectCodexRateLimit(codexResponse, "gpt-5.5"))).toBe("5h:1% wk:18%");
    expect(summarizeTodosJson(JSON.stringify({ version: 1, todos: [{ status: "done" }, { status: "pending" }] })).label).toBe("1/2");
    expect(formatModelLabel({ id: "gpt-5.5", name: "GPT-5.5", provider: "openai-codex" })).toBe("GPT-5.5 Codex");
    expect(formatPath("/Users/hyuns/.pi/agent", "/Users/hyuns")).toBe("~/.pi/agent");
  });
});
