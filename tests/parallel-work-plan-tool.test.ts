import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: Record<string, unknown>,
  ) => Promise<{ content?: Array<{ type: string; text: string }>; details?: Record<string, unknown> }>;
}

function registeredTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  ddotzAutopilot({
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: (definition: RegisteredTool) => tools.set(definition.name, definition),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return tools;
}

describe("parallel work plan tool", () => {
  it("registers a collision-safe ownership planner for parallel development", async () => {
    const tools = registeredTools();
    const tool = tools.get("parallel_work_plan");

    expect(tool).toBeDefined();

    const result = await tool!.execute(
      "parallel-plan-call",
      {
        goal: "Implement settings changes in parallel",
        items: [
          { id: "ui", description: "Settings panel", files: ["src/ui/settings.tsx"], domains: ["ui"] },
          { id: "ui-test", description: "Settings panel tests", files: ["src/ui/settings.tsx"], domains: ["ui"] },
          { id: "api", description: "Settings API", files: ["src/api/settings.ts"], domains: ["api"] },
        ],
      },
      undefined,
      vi.fn(),
      { cwd: "/repo" },
    );

    const text = result.content?.map((item) => item.text).join("\n") ?? "";
    expect(text).toContain("Parallel work ownership plan");
    expect(text).toContain("same-lane-serial");
    const plan = result.details?.plan as { conflicts: Array<Record<string, unknown>> };
    expect(plan.conflicts).toContainEqual(expect.objectContaining({
      type: "file",
      scope: "src/ui/settings.tsx",
      resolution: "same-lane-serial",
    }));
  });
});
