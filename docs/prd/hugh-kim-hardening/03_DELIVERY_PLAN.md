# 03_DELIVERY_PLAN — choco-pi Hardening Roadmap

## Delivery strategy

Deliver the work as small, reversible hardening increments. The MVP is P0 only: Requirement Lock plus Feature Deletion Detector integrated into existing `spec_gate` and `structural_gate` flows. P1 and P2 remain planned until P0 proves low false-positive risk.

## MVP cutline

### MVP includes

- Requirement lock data model.
- Automatic lock derivation from Working Spec.
- Structural gate blocking for unresolved MUST items.
- Feature deletion detector for deterministic diff patterns.
- Spec Delta reconciliation path.
- Unit and integration tests.
- Documentation and diagnostic messages.

### MVP excludes

- Automatic source harvesting or patch application.
- Full memory graph adoption.
- New multi-agent runtime.
- New user-facing UI beyond existing diagnostics.
- Browser screenshot or DB roundtrip automation.

## Phase 0 — PRD and implementation planning

### Entry criteria

- Hugh review and choco-pi local source comparison completed.
- PRD document set exists under `docs/prd/hugh-kim-hardening/`.

### Work

- Review this PRD for scope and contradictions.
- Convert README handoff block into `spec_gate start` for implementation.
- Identify files likely to change.

### Exit criteria

- No placeholder sections remain.
- P0 implementation plan can be written without another planning interview.

### Validation

- Markdown placeholder scan.
- PRD file readback.
- `git diff -- docs/prd/hugh-kim-hardening` review.

## Phase 1 — Requirement Lock MVP

### Entry criteria

- `spec_gate` and `structural_gate` tests pass before changes.
- Implementation spec is started with `spec_gate`.

### Likely files

- `extensions/choco-autopilot/dynamic-sdd.ts`
- `extensions/choco-autopilot/structural-gate.ts`
- `extensions/choco-autopilot/autonomy-protocol.ts` if required for tool satisfaction semantics
- `extensions/choco-autopilot/session-dashboard.ts` if diagnostics surface is needed
- `tests/dynamic-sdd.test.ts`
- `tests/structural-gate.test.ts`
- `tests/structural-gate-autonomy-protocol.test.ts`

### Work

1. Add lock item derivation helper with deterministic ids.
2. Persist lock state in choco-pi state or dynamic SDD turn state.
3. Add lock status reconciliation from Spec Delta.
4. Extend structural gate review to block unresolved MUST lock items.
5. Add concise failure text.

### RED tests

- `structural_gate` rejects completion when acceptance criterion is active and unverified.
- `spec_gate delta` with deferred handling prevents silent removal from active scope.
- Existing micro-coding protocol still completes without `spec_gate` ceremony.

### GREEN tests

- Verified MUST item allows completion.
- Deferred/removed item with accepted Spec Delta does not block completion.
- Session-scoped locks do not leak across sessions or cwd.

### Exit criteria

- Requirement Lock blocks false completion in tests.
- No regression in dynamic SDD persistence tests.
- Failure output is concise and includes next action.

## Phase 2 — Feature Deletion Detector MVP

### Entry criteria

- Phase 1 merged locally and tests passing.
- Diff detector interface agreed in code.

### Likely files

- New `extensions/choco-autopilot/feature-deletion-detector.ts`
- `extensions/choco-autopilot/structural-gate.ts`
- `extensions/choco-autopilot/git-runtime.ts` or a small diff helper if existing helpers fit
- New `tests/feature-deletion-detector.test.ts`
- Existing structural gate integration tests

### Work

1. Implement deterministic diff scanner for selected patterns.
2. Classify severity and blocking behavior.
3. Reconcile FeatureChange with Spec Delta.
4. Integrate detector into structural gate completion review.
5. Add docs and failure message examples.

### RED tests

- Removed exported function without delta blocks completion.
- Removed test case near touched implementation blocks completion.
- New placeholder in implementation path blocks completion.
- New hidden rendering pattern blocks completion.

### GREEN tests

- Intentional deletion with accepted Spec Delta passes.
- Docs-only deletion does not block unless it removes gate/acceptance content.
- Generated or ignored paths do not create noisy failures.

### Exit criteria

- Detector catches seeded patterns.
- False-positive escape requires Spec Delta, not silent ignore.
- Full quality gate passes.

## Phase 3 — Source Harvester 2.0 review-only

### Entry criteria

- P0 deployed and dogfooded.
- Source registry tests are stable.

### Likely files

- `extensions/choco-autopilot/source-registry.ts`
- Source registry tool command handlers in `index.ts`
- `adoption-analysis-policy.ts`
- `adoption-analysis-quality.ts`
- `tests/source-registry-tool.test.ts`
- `tests/adoption-analysis-quality.test.ts`

### Work

1. Add scoring fields and review rationale to source registry records.
2. Add keep/discard/watch decision summary.
3. Add package baseline check step for Pi features.
4. Add changed-source review template.
5. Keep all apply behavior manual/review-only.

### Exit criteria

- Source records can capture score, risk, adoption depth, and reversal trigger.
- No external code is auto-applied.
- report/adoption quality guards require provenance.

## Phase 4 — Memory/Dogfood patch proposal loop

### Entry criteria

- P0 false-positive rate is acceptable.
- Build-vs-buy review completed for `pi-hermes-memory`.

### Likely files

- `dogfood-weekly.ts`
- `dogfood-scoring.ts`
- `dogfood-types.ts`
- `dogfood-commands.test.ts`
- `memory.ts` only if local memory stays in scope

### Work

1. Extend dogfood repeated patterns into patch proposal records.
2. Add proposal states: candidate, planned, implemented, verified, rejected.
3. Require verification plan and privacy review per proposal.
4. Optionally integrate `pi-hermes-memory` if source review passes.

### Exit criteria

- Dogfood can suggest but not silently apply policy/code changes.
- Proposals include provenance and verification plan.
- Privacy tests prove no raw prompt leakage.

## Phase 5 — Project Profile

### Entry criteria

- P0/P1 stabilized.
- Need for project-specific profile appears in dogfood or user workflow.

### Work

1. Scan package/config/source/test files.
2. Verify build/test commands before recording.
3. Save a project-scoped profile under safe choco-pi state or explicit project path.
4. Preserve existing instructions and avoid overwrite.

### Exit criteria

- Profile generation is evidence-based and append/merge-safe.
- Incorrect command detection has tests.

## Dependency graph

```text
PRD
 └─ Phase 1 Requirement Lock
     └─ Phase 2 Feature Deletion Detector
         ├─ Phase 3 Source Harvester 2.0
         ├─ Phase 4 Memory/Dogfood Proposal Loop
         └─ Phase 5 Project Profile
```

Requirement Lock comes before deletion detection because detector findings need the accepted requirement context to distinguish legitimate refactors from scope shrinkage.

## Validation strategy

### Required commands after code changes

```bash
pnpm run version:check
pnpm run lint
pnpm run typecheck
pnpm run test
```

For final integration, prefer:

```bash
pnpm run check
```

### Required checks after docs-only changes

```bash
git status --short --untracked-files=all
rg -n "T[B]D|PLACE[H]OLDER|\?\?" docs/prd/hugh-kim-hardening
```

The placeholder scan should return no unresolved PRD placeholders.

## Rollback and kill criteria

### Rollback criteria

- Structural gate blocks valid completions without a Spec Delta escape path.
- Existing protocol completion tests regress.
- Requirement locks leak across sessions or projects.
- Detector stores raw private content or secrets.

### Kill criteria for P1/P2 expansions

- Existing Pi package provides the same capability with safer maintenance economics.
- Source review finds incompatible license or unsafe dependency behavior.
- The feature requires private-data transfer or secret access beyond approval boundaries.

## Launch readiness checklist

- P0 RED/GREEN tests are present.
- Full `pnpm run check` passes.
- README documents lock lifecycle and recovery.
- Failure text is concise in Telegram-width contexts.
- No external source code is adopted without registry record and review.
- No version bump unless runtime behavior change warrants it; if bumped, version sync passes.

## Deferred follow-ups

- Add optional `/requirements` command if users need manual lock inspection.
- Add richer semantic deletion detection after dogfood evidence accumulates.
- Add source scoring visualization only if source_registry data becomes hard to inspect.
- Add project profile only after repeated project-context misses justify it.
