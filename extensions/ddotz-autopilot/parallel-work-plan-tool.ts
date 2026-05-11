import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatParallelWorkPlan, planParallelWorkAreas, type ParallelWorkItemInput } from "./worktree-planner";

interface ParallelWorkPlanToolParams {
  goal?: string;
  items: ParallelWorkItemInput[];
  maxLanes?: number;
}

const ParallelWorkItemParams = Type.Object({
  id: Type.Optional(Type.String({ description: "Stable task id used by dependsOn" })),
  description: Type.String({ description: "Concrete work item description" }),
  files: Type.Optional(Type.Array(Type.String({ description: "Files or directories this item may write" }))),
  domains: Type.Optional(Type.Array(Type.String({ description: "Logical domains/packages this item may write" }))),
  dependsOn: Type.Optional(Type.Array(Type.String({ description: "Task ids that must finish before this item starts" }))),
  write: Type.Optional(Type.Boolean({ description: "False for read-only research/review work" })),
});

export function registerParallelWorkPlanTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "parallel_work_plan",
    label: "Parallel work plan",
    description: "Create a collision-resistant file/domain ownership plan before parallel writable development.",
    promptSnippet: "parallel_work_plan: partition parallel development into file/domain owner lanes and serialize shared writable scopes.",
    promptGuidelines: [
      "Use parallel_work_plan before spawning 2+ writable parallel agents or sessions.",
      "parallel_work_plan requires each writable item to list intended files or domains; unknown shared files must be serialized instead of assigned to multiple lanes.",
    ],
    parameters: Type.Object({
      goal: Type.Optional(Type.String({ description: "Overall user goal for the parallel work" })),
      items: Type.Array(ParallelWorkItemParams, { description: "Candidate work items to partition" }),
      maxLanes: Type.Optional(Type.Number({ description: "Optional maximum number of parallel owner lanes" })),
    }),
    async execute(_toolCallId, params) {
      const input = params as ParallelWorkPlanToolParams;
      const plan = planParallelWorkAreas({
        goal: input.goal,
        items: input.items,
        maxLanes: input.maxLanes,
      });
      return {
        content: [{ type: "text", text: formatParallelWorkPlan(plan) }],
        details: { plan },
      };
    },
  });
}
