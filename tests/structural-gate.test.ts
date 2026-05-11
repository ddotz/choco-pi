import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown; terminate?: boolean }>;
}

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function setupAutopilot(): {
  handlers: Map<string, EventHandler[]>;
  tools: Map<string, RegisteredTool>;
  sendMessage: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  const sendMessage = vi.fn();
  const sendUserMessage = vi.fn();

  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage,
    sendUserMessage,
  } as never);

  return { handlers, tools, sendMessage, sendUserMessage };
}

async function emitFirst(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>): Promise<unknown> {
  const handler = handlers.get(eventName)?.[0];
  if (!handler) throw new Error(`missing handler: ${eventName}`);
  return handler(event, { cwd: "/repo", hasUI: false, ui: {} });
}

describe("structural gate guard", () => {
  it("registers a structural_gate tool", () => {
    const { tools } = setupAutopilot();
    expect(tools.has("structural_gate")).toBe(true);
  });

  it("fails closed internally without showing structural gate repair text to the user when structural_gate was skipped", async () => {
    const { handlers, sendMessage, sendUserMessage } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "버그 고치고 테스트까지 해줘", systemPrompt: "base", systemPromptOptions: {} });

    const original = assistantMessage("완료했습니다. 테스트도 통과했습니다.");
    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: original }) as { message: AssistantMessage };

    const replacementText = (result.message.content[0] as { type: "text"; text: string }).text;
    expect(replacementText).toBe("");
    expect(replacementText).not.toContain("Structural gate blocked");
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "ddotz.structural_gate.repair",
        display: false,
        content: expect.stringContaining("structural_gate 보강이 필요합니다"),
      }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });

  it("rejects structural_gate reviews that omit loop governance evidence", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "기능 구현하고 검증해줘", systemPrompt: "base", systemPromptOptions: {} });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "User asked for implementation and verification; both are addressed.",
        runtimeFit: "Tests cover the changed behavior and runtime caveat is noted.",
        failureModes: "Remaining extension reload risk is documented.",
        verificationEvidence: "pnpm run test passed.",
        completionBoundary: "Requested outcome satisfied with no critical in-scope issue left.",
        confidence: "High",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("loopGovernance") });

    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: assistantMessage("완료했습니다.") }) as { message: AssistantMessage };
    const replacementText = (result.message.content[0] as { type: "text"; text: string }).text;
    expect(replacementText).toBe("");
  });

  it("allows a non-trivial final answer after structural_gate passes with loop governance evidence", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "기능 구현하고 검증해줘", systemPrompt: "base", systemPromptOptions: {} });

    await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "User asked for implementation and verification; both are addressed.",
        runtimeFit: "Tests cover the changed behavior and runtime caveat is noted.",
        failureModes: "Remaining extension reload risk is documented.",
        verificationEvidence: "pnpm run test passed.",
        loopGovernance: "Step transitions stayed within the current plan/todo, and no new work was silently appended after the current todo without a new steering/new loop.",
        completionBoundary: "Requested outcome satisfied with no critical in-scope issue left.",
        confidence: "High",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    const original = assistantMessage("완료했습니다.\n\nConfidence: High");
    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: original });

    expect(result).toBeUndefined();
  });

  it("requires loop_transition evidence after a todo step is completed", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "현재 todo 끝나면 다음 단계로 넘어가", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-1", toolName: "todo", input: { action: "set_status", id: 1, status: "done" } });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "Current todo step was completed.",
        runtimeFit: "No runtime change was made.",
        failureModes: "Step transition could be misreported if loop transition evidence is omitted.",
        verificationEvidence: "Todo status transition was observed.",
        loopGovernance: "The current todo was completed and the next step should be checked before continuing.",
        completionBoundary: "Need a loop transition before final completion.",
        confidence: "Medium",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("loop_transition") });
  });

  it("accepts loop_transition evidence for a completed todo step", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "현재 todo 끝나면 다음 단계로 넘어가", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-1", toolName: "todo", input: { action: "set_status", id: 1, status: "done" } });

    const loopResult = await tools.get("loop_transition")!.execute(
      "loop-1",
      {
        currentStep: "todo #1 implementation step",
        nextStep: "todo #2 verification step",
        transitionDecision: "Move only after checking the next action still fits the active plan.",
        currentTodoFit: "todo #1 is complete and todo #2 remains within the current plan.",
        newWorkDiscovered: false,
        newWorkHandling: "none",
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );
    expect(loopResult.details).toMatchObject({ ok: true });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "Current todo step was completed and transition evidence was recorded.",
        runtimeFit: "No runtime change was made.",
        failureModes: "No silent new work was appended.",
        verificationEvidence: "loop_transition recorded the step transition.",
        loopGovernance: "loop_transition recorded that todo #2 remains within the current plan and no new work was discovered.",
        completionBoundary: "Requested step transition is safe.",
        confidence: "High",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: true });
  });

  it("requires new-work handling when a todo is added after the current todo is complete", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "현재 todo 이후 신규 할 일이 생기면 새 루프로 처리해", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-1", toolName: "todo", input: { action: "set_status", id: 1, status: "done" } });

    await tools.get("loop_transition")!.execute(
      "loop-1",
      {
        currentStep: "todo #1 implementation step",
        nextStep: "todo #2 verification step",
        transitionDecision: "The planned next step still fits the active loop.",
        currentTodoFit: "todo #1 is complete and todo #2 remains within the current plan.",
        newWorkDiscovered: false,
        newWorkHandling: "none",
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-2", toolName: "todo", input: { action: "add", text: "new unplanned task", status: "pending" } });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "A new todo was added after the current todo completed.",
        runtimeFit: "No runtime change was made.",
        failureModes: "New work could be silently appended to the active loop.",
        verificationEvidence: "todo.add happened after todo.set_status done.",
        loopGovernance: "New work appeared after the current todo but was not routed through a new loop.",
        completionBoundary: "Cannot complete until new-work handling is recorded.",
        confidence: "Medium",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("new work after the current todo") });
  });

  it("accepts new-work handling when loop_transition records a new loop plan", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "현재 todo 이후 신규 할 일이 생기면 새 루프로 처리해", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-1", toolName: "todo", input: { action: "set_status", id: 1, status: "done" } });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-2", toolName: "todo", input: { action: "add", text: "new unplanned task", status: "pending" } });

    const loopResult = await tools.get("loop_transition")!.execute(
      "loop-1",
      {
        currentStep: "todo #1 implementation step",
        nextStep: "fresh loop for newly discovered task",
        transitionDecision: "New work appeared after the current todo, so it must not be appended silently.",
        currentTodoFit: "Current todo is complete; the new task is separated into a fresh loop.",
        newWorkDiscovered: true,
        newWorkHandling: "new-loop",
        newLoopPlan: "Plan the new task, reset/create todos for that scope, then continue after new steering.",
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );
    expect(loopResult.details).toMatchObject({ ok: true });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "New work after the current todo was separated into a fresh loop plan.",
        runtimeFit: "No runtime change was made.",
        failureModes: "Silent scope expansion is blocked by loop_transition evidence.",
        verificationEvidence: "loop_transition recorded new-loop handling with a newLoopPlan.",
        loopGovernance: "New work after the current todo used new-loop handling and a fresh plan before continuing.",
        completionBoundary: "Safe to complete this loop and let the new loop proceed separately.",
        confidence: "High",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: true });
  });

  it("accepts final as a loop_transition next step", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "마지막 단계로 종료해", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "todo-1", toolName: "todo", input: { action: "set_status", id: 1, status: "done" } });

    const loopResult = await tools.get("loop_transition")!.execute(
      "loop-final",
      {
        currentStep: "todo #1 final verification step",
        nextStep: "final",
        transitionDecision: "Final completion is safe after verification.",
        currentTodoFit: "The final response remains within the current requested scope.",
        newWorkDiscovered: false,
        newWorkHandling: "none",
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(loopResult.details).toMatchObject({ ok: true });
  });

  it("rejects ready-to-complete medium confidence so the agent must reinforce or report a blocker", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "검증까지 마무리해", systemPrompt: "base", systemPromptOptions: {} });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-medium",
      {
        acceptanceFit: "Requested outcome appears complete.",
        runtimeFit: "Some runtime evidence exists but dogfood is incomplete.",
        failureModes: "Remaining runtime uncertainty has not been reinforced or blocked.",
        verificationEvidence: "Targeted tests passed.",
        loopGovernance: "Step transitions stayed within the current plan and no new work was appended.",
        completionBoundary: "Trying to stop with medium confidence.",
        confidence: "Medium",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("Medium confidence") });
  });

  it("allows medium confidence only when completion is blocked with a concrete blocker", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "외부 계정 설정까지 확인해", systemPrompt: "base", systemPromptOptions: {} });

    const gateResult = await tools.get("structural_gate")!.execute(
      "gate-medium-blocked",
      {
        acceptanceFit: "Work is not complete because a secret/account approval boundary remains.",
        runtimeFit: "Runtime verification cannot proceed without credentials.",
        failureModes: "The remaining failure mode is blocked by a user-controlled credential boundary.",
        verificationEvidence: "Local checks passed; credentialed external verification was not run.",
        loopGovernance: "Step transitions stayed within the current plan and the remaining work is blocked, not silently appended.",
        completionBoundary: "Blocked by secret/account approval boundary; cannot safely continue autonomously.",
        confidence: "Medium",
        readyToComplete: false,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("readyToComplete is false") });
  });

  it("requires the gate if a tool call happened even when the prompt looked trivial", async () => {
    const { handlers } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "확인", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm test" } });

    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: assistantMessage("통과했습니다.") }) as { message: AssistantMessage };
    const replacementText = (result.message.content[0] as { type: "text"; text: string }).text;
    expect(replacementText).toBe("");
  });
});
