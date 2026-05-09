import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

describe("extension command names", () => {
  it("registers personal commands without the ddotz prefix", () => {
    const commands = new Map<string, unknown>();
    ddotzAutopilot({
      on: vi.fn(),
      registerCommand: (name: string, definition: unknown) => {
        commands.set(name, definition);
      },
      exec: vi.fn(),
      getFlag: vi.fn(),
    } as never);

    expect([...commands.keys()]).toEqual(expect.arrayContaining(["mode", "intensity", "source", "memory", "ledger"]));
    expect([...commands.keys()].filter((name) => name.startsWith("ddotz-"))).toEqual([]);
  });
});
