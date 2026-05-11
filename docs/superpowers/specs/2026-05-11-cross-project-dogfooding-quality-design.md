# Cross-project Dogfooding Quality Design

Date: 2026-05-11
Status: design approved for autonomous implementation planning
Owner: ddotz-pi

## Objective

Add a cross-project dogfooding quality system that analyzes the user's Pi prompts weekly, measures `clean / assisted / miss` outcomes, and turns repeated quality issues into safe self-improvement work.

The system is user/agent-instance scoped, not project scoped. Projects are analysis slices, not storage boundaries.

## Decisions

- Use `clean / assisted / miss` as the top-level quality taxonomy.
- Analyze all Pi work across projects, then slice by project, work mode, task type, model, tool failure type, and verification outcome.
- Do not store raw prompt text by default. Store sanitized summaries, hashes, classifications, and outcome signals.
- Use rules for first-pass scoring, LLM judge for second-pass scoring, and a review queue for ambiguous samples.
- Run weekly analysis automatically when due, support `/dogfood weekly`, and require a minimum sample threshold before auto-improvement.
- Auto-improve only low-risk items. Data collection expansion, personal data storage, and work-mode policy changes always remain approval-gated.
- Keep detailed metadata for 12 weeks, then retain only weekly aggregates.

## External research adopted as idea-only references

No external package is adopted as code. The following sources shape the design pattern only:

- OpenAI trace grading: grade end-to-end agent traces to assess quality, correctness, and regressions.
- LangSmith evaluation: combine offline curated dataset evals with online live-traffic evaluation.
- Langfuse evaluation: use scores attached to traces/sessions and feed live edge cases back into datasets.
- Microsoft LLM evaluation metrics: automatic evaluation should be complemented by human review because LLM judges can be biased.
- IBM hit rate metric: a ratio metric can track whether at least one relevant target was hit, but ddotz-pi needs its own domain-specific `clean hit` definition.
- PromptLayer analytics: prompt usage, latency, cost, request volume, and model distribution are useful supporting metrics.
- LearningLoop dogfooding: structured internal use, lightweight feedback channels, and time-to-fix/internal bug metrics improve product quality.
- pi.dev package scan: no high-similarity package exists for cross-project prompt quality dogfooding; implement locally.

## Concepts and scoring

### Unit of analysis

A `DogfoodCase` represents one user prompt and the agent work it triggered. A case can span multiple assistant turns when tool use, repairs, or follow-up gate checks occur.

### Outcome labels

- `clean`: The request is satisfied without user correction or unresolved repair, verification evidence is present when relevant, structural gate passes when required, and no related rework appears shortly after completion.
- `assisted`: The request is eventually satisfied, but it needed user clarification, a repair loop, failed verification that was fixed, a review-queue decision, or notable manual steering.
- `miss`: The request is not satisfied, verification remains failed, the agent misreports completion, the user has to correct/restate materially, or a gate blocks completion without a clean blocker report.

### Clean hit rate

`clean_hit_rate = clean_cases / eligible_cases`.

Secondary rates:

- `assisted_rate = assisted_cases / eligible_cases`
- `miss_rate = miss_cases / eligible_cases`
- `repair_rate = cases_with_internal_repair / eligible_cases`
- `verification_failure_recovery_rate = fixed_failed_verifications / failed_verifications`
- `gate_compliance_rate = passed_required_gates / required_gates`

### Minimum sample threshold

Auto-improvement requires both:

1. At least 25 eligible cases in the week.
2. The same `miss` or `assisted` pattern appears at least 3 times.

If the threshold is not met, the system still writes a weekly observation report but does not apply improvements.

## Data model

Store dogfooding data under the global ddotz-pi state directory:

```text
~/.pi/agent/ddotz-pi/dogfood/
  events.jsonl              # append-only recent signal stream
  cases/<case-id>.json      # detailed case metadata, retained for 12 weeks
  weekly/YYYY-WW.json       # aggregate reports and improvement decisions
  review-queue.json         # ambiguous cases needing future review
```

### Privacy-preserving case shape

```ts
interface DogfoodCase {
  id: string;
  week: string;
  startedAt: string;
  endedAt?: string;
  promptHash: string;
  promptSummary?: string;        // sanitized, short, non-verbatim
  cwdHash?: string;
  projectLabel?: string;         // repo basename or safe alias only
  workMode: string;
  executionIntensity: string;
  taskType: string;
  model?: string;
  toolCounts: Record<string, number>;
  verification: {
    required: boolean;
    passed: boolean;
    failedCommands: string[];
  };
  gates: {
    structuralRequired: boolean;
    structuralPassed: boolean;
    loopTransitions: number;
    repairQueued: boolean;
  };
  userSteeringSignals: string[];
  outcome: "clean" | "assisted" | "miss" | "review";
  outcomeConfidence: "High" | "Medium" | "Low";
  ruleReasons: string[];
  judgeReason?: string;
}
```

Raw prompt text, raw assistant output, raw tool output, secrets, and full filesystem paths are not stored by default.

## Architecture

### 1. Signal collector

Extend `ddotz-autopilot` hooks to emit quality events:

- `before_agent_start`: create a case, hash prompt, classify rough task type, record active mode/intensity/cwd slice.
- `tool_call` and `tool_result`: record tool counts, failures, verification command outcomes, and risky patterns without storing full output.
- `loop_transition` and `structural_gate`: record gate compliance and repair status.
- `message_end`: close or update the case, detect blocked/repair responses, and mark obvious clean/assisted/miss signals.
- `session_start`: run retention cleanup and weekly due checks.

### 2. Case builder and store

Create a small dogfood module under `extensions/ddotz-autopilot/`:

- `dogfood-store.ts`: append/read cases, weekly aggregates, review queue, retention cleanup.
- `dogfood-case.ts`: case lifecycle helpers and privacy hashing.
- `dogfood-scoring.ts`: deterministic scoring rules.
- `dogfood-weekly.ts`: weekly aggregation and improvement candidate generation.

Use atomic writes and JSONL append discipline consistent with existing ddotz-pi state handling.

### 3. Rule scorer

Rules assign a first-pass outcome:

- Clean signals: required gate passed, verification passed, no failed tool unrecovered, no internal repair, no follow-up correction marker.
- Assisted signals: clarification needed, failed verification later fixed, structural repair queued then passed, review queue resolved, repeated tool retry recovered.
- Miss signals: gate failed at final, verification failed at final, user correction marker after claimed completion, approval boundary misclassified, unresolved blocker without evidence.

Rules must emit reasons so weekly reports can explain why a case was scored.

### 4. LLM judge and review queue

LLM judge runs only on sanitized case summaries and only for cases where:

- rule confidence is not High,
- the case is part of a repeated weekly pattern,
- or a user runs `/dogfood weekly --judge`.

Ambiguous cases stay in `review-queue.json` and are revisited in the next weekly analysis. The initial implementation should avoid hidden background model calls; judge work runs in the foreground agent loop or through explicit command execution to keep cost visible.

### 5. Weekly analyzer

Weekly output includes:

- clean/assisted/miss counts and rates,
- trend versus prior 4 weeks,
- top repeated failure patterns,
- slices by project/work mode/task type/model/tool,
- proposed improvement candidates,
- auto-applied improvements and verification evidence,
- deferred approval-gated items.

Report path:

```text
~/.pi/agent/ddotz-pi/dogfood/weekly/YYYY-WW.json
```

A concise Markdown summary can be generated on demand via `/dogfood report`.

### 6. Improvement runner

Allowed low-risk automatic improvements:

- prompt/policy wording clarifications,
- evaluation rubric changes,
- tests for scoring/retention/reporting,
- small local extension fixes related to signal capture or reporting,
- documentation updates.

Approval-gated changes:

- storing new raw data classes,
- expanding personal/private data retention,
- changing work-mode semantics,
- enabling hidden/background paid model calls,
- deleting historical data beyond retention cleanup,
- publishing packages or deploying externally.

Automatic code changes must use the normal ddotz-pi development loop: TDD where applicable, version check, lint, typecheck, tests, runtime reload when extension behavior changes, structural gate, then commit/push when appropriate.

## Commands and UI

Register a `dogfood` command:

```text
/dogfood status          # show current week sample count, due state, last report
/dogfood weekly          # run weekly deterministic analysis
/dogfood weekly --judge  # include foreground LLM judge for ambiguous cases
/dogfood report          # show latest concise report
/dogfood queue           # show review queue summary
/dogfood explain <id>    # explain one case without raw prompt text
```

Optional footer/widget signal:

```text
dogfood 18/25 due:3d clean:72%
```

## Mode plan

- `default`: design, implementation, local analysis, tests, and low-risk improvements.
- `web-analysis`: external research refreshes and evidence-backed comparisons.
- `adoption-analysis`: future package/repo adoption reviews only when a source is actually being considered for implementation.
- `coding` remains planned, so implementation stays in `default` until that mode is implemented.

## Testing strategy

- Unit tests for privacy hashing and prompt non-persistence.
- Unit tests for clean/assisted/miss rule scoring.
- Unit tests for minimum sample and repeated-pattern thresholds.
- Unit tests for 12-week detail retention and aggregate preservation.
- Command tests for `/dogfood status`, `/dogfood weekly`, and report output.
- Integration-style tests for hook event sequences: clean case, assisted repair, miss, approval-boundary blocker, and review queue.
- Policy tests that prohibit storing raw prompt/tool output by default.

## Rollout phases

1. **MVP capture and deterministic report**
   - Store privacy-preserving cross-project cases.
   - Implement scoring rules, weekly aggregation, retention cleanup, `/dogfood status`, and `/dogfood weekly`.

2. **Judge and review queue**
   - Add sanitized judge input builder, ambiguous-case queue, and `/dogfood weekly --judge`.

3. **Improvement candidate generation**
   - Convert repeated patterns into proposed prompt/rubric/test/doc/code improvement candidates.

4. **Low-risk auto-improvement**
   - Allow automatic low-risk patches through the normal verified ddotz-pi development loop.

5. **Runtime polish**
   - Add footer/widget status, concise reports, and due notifications.

## Non-goals

- Do not build a customer analytics SaaS.
- Do not store raw prompts, raw assistant messages, raw tool output, or full filesystem paths by default.
- Do not run hidden background paid LLM judging in the first implementation.
- Do not make project-local quality the primary model; cross-project user/agent quality remains primary.

## Open implementation defaults

The following defaults are chosen autonomously unless a hard boundary appears:

- Use SHA-256 with a local random salt for prompt and cwd hashes.
- Use ISO week IDs for weekly buckets.
- Keep all dogfood files under `~/.pi/agent/ddotz-pi/dogfood/` rather than the repository workspace.
- Treat project labels as safe aliases derived from repo basename, with hashes used for stable joins.
- Start with deterministic scoring and add judge support only after sanitized case generation is tested.
