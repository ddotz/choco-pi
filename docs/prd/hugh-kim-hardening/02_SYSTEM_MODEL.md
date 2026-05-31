# 02_SYSTEM_MODEL — choco-pi Hardening Domain Model

## System overview

The hardening system extends existing choco-pi runtime primitives:

```text
User request
  → spec_gate Working Spec
  → Requirement Lock
  → implementation / research / edits
  → Spec Delta handling
  → Feature Deletion Detector
  → structural_gate completion review
  → final report or blocked repair loop
```

The design keeps `spec_gate` as the source of accepted scope and `structural_gate` as the final completion boundary. Requirement Lock and Feature Deletion Detector are support subsystems, not new modes.

## Core entities

### WorkingSpec

Existing dynamic SDD object.

| Field | Meaning |
| --- | --- |
| `objective` | User-approved task objective. |
| `scope[]` | In-scope work items. |
| `acceptanceCriteria[]` | Observable completion criteria. |
| `testStrategy[]` | Verification plan. |
| `risks[]` | Known failure modes. |
| `updatedAt` | Last update timestamp. |

### RequirementLock

Derived state that makes a Working Spec checkable at completion time.

| Field | Meaning |
| --- | --- |
| `id` | Stable session/cwd-scoped lock id. |
| `sessionKey` | Normalized session id. |
| `cwdKey` | Project/session scope key. |
| `specHash` | Hash of the accepted Working Spec. |
| `items[]` | RequirementLockItem list. |
| `createdAt` / `updatedAt` | Lifecycle timestamps. |

### RequirementLockItem

A single requirement that must be reconciled.

| Field | Meaning |
| --- | --- |
| `id` | Stable item id, e.g. `REQ-AC-001`. |
| `source` | `objective`, `scope`, `acceptance`, or `delta`. |
| `priority` | `must`, `should`, or `informational`. |
| `text` | Requirement text. |
| `status` | `active`, `verified`, `deferred`, `removed-by-delta`, `blocked`. |
| `evidence[]` | VerificationEvidence ids or summaries. |
| `deltaId` | Spec Delta id that changed this item. |
| `reason` | Human-readable status explanation. |

### SpecDelta

Existing dynamic SDD delta plus hardening interpretation.

| Field | Meaning |
| --- | --- |
| `description` | New fact or scope change. |
| `handling` | `in-scope`, `deferred`, `new-steering`, `new-loop`, `approval-boundary`. |
| `proposedChanges` | Scope/acceptance/test/risk changes. |
| `affectedLockItems[]` | Requirement ids changed by this delta. |

### FeatureChange

A suspicious change detected from git/worktree diff.

| Field | Meaning |
| --- | --- |
| `id` | Stable change id. |
| `filePath` | Relative path. |
| `changeKind` | `export-removal`, `test-removal`, `placeholder-added`, `hidden-rendering`, `tool-command-removal`, `gate-removal`, `large-deletion`. |
| `severity` | `critical`, `high`, `medium`, `low`. |
| `evidenceSummary` | Minimal non-sensitive summary. |
| `matchedPattern` | Detector pattern id. |
| `requiresDelta` | Boolean. |
| `deltaId` | Accepted delta that explains it, if any. |
| `status` | `unresolved`, `explained`, `ignored-low-risk`, `blocked`. |

### VerificationEvidence

A structured reference to proof used by `structural_gate`.

| Field | Meaning |
| --- | --- |
| `id` | Evidence id. |
| `kind` | `test`, `typecheck`, `lint`, `runtime`, `manual-read`, `report-gate`, `screenshot`, `db-roundtrip`, `other`. |
| `commandClass` | Sanitized command class when relevant. |
| `summary` | Short result summary. |
| `lockItemIds[]` | Lock items this evidence supports. |
| `createdAt` | Timestamp. |

### SourceCandidate

Extension of source registry entries for P1.

| Field | Meaning |
| --- | --- |
| `sourceId` | Existing source registry id. |
| `fitScore` | choco-pi fit score. |
| `piCompatibilityScore` | Pi-native fit. |
| `hardGatePotentialScore` | Can the idea become a checkable guard? |
| `evidenceQualityScore` | Provenance strength. |
| `maintenanceRiskScore` | Higher means riskier. |
| `securityLicenseRisk` | `low`, `medium`, `high`, `unknown`. |
| `decision` | `keep`, `discard`, `watch`, `needs-review`. |
| `adoptionDepth` | Existing adoption depth taxonomy. |

### DogfoodPattern and PatchProposal

P1 entities for self-improvement.

```text
DogfoodCase[] → repeated pattern → PatchProposal → tests → implementation → structural_gate
```

PatchProposal must never include raw prompt text or private data.

## Requirement Lock state machine

```text
active
  ├─ verification evidence matches → verified
  ├─ accepted Spec Delta defers → deferred
  ├─ accepted Spec Delta removes → removed-by-delta
  └─ final completion with no evidence/delta → blocked
```

Rules:

- `must` items cannot be ignored.
- `should` items may remain active only if final failureModes or notes explicitly defer them as non-critical.
- `informational` items do not block completion.
- A lock item cannot move to `verified` without evidence.
- A lock item cannot move to `removed-by-delta` without explicit delta text.

## FeatureChange state machine

```text
unresolved
  ├─ matched accepted Spec Delta → explained
  ├─ low-risk known false positive → ignored-low-risk
  └─ completion attempted → blocked
```

Rules:

- High/critical changes require delta explanation.
- Low-risk changes can be ignored only when detector has a documented rule.
- New hidden rendering in user-visible feature files is high severity by default.
- Test removal near changed implementation is high severity by default.

## Interfaces

### spec_gate integration

- On `start`, derive or refresh RequirementLock.
- On `delta`, update lock items only when handling is in-scope or explicitly affects scope.
- On `list`, optionally show lock summary.

### structural_gate integration

Before accepting `readyToComplete=true`, structural gate checks:

1. unresolved MUST lock items,
2. suspicious FeatureChange without accepted delta,
3. missing verification evidence for lock items,
4. protocol-required tool satisfaction.

If any critical item remains, result must be blocked.

### diff detector interface

A library interface should be deterministic and unit-testable:

```ts
interface FeatureDeletionDetectorInput {
  repoRoot: string;
  changedFiles: string[];
  diffText: string;
  workingSpec?: WorkingSpec;
  deltas: SpecDelta[];
}

interface FeatureDeletionDetectorResult {
  changes: FeatureChange[];
  blockingChanges: FeatureChange[];
  summary: string;
}
```

The implementation can be used by `structural_gate`, write-scope guard post-diff checks, or future diagnostics.

### diagnostics interface

Concise example:

```text
completion blocked:
- REQ-AC-002 unresolved: no verification evidence
- DEL-003 suspicious deletion: removed test without Spec Delta
next: verify requirement or record a Spec Delta
```

## Data storage

### Preferred storage

Requirement locks should live in existing choco-pi state under the session/cwd scope, aligned with dynamic SDD persistence.

Possible structure:

```json
{
  "requirementLocks": {
    "<sessionKey>::<cwdKey>": {
      "id": "lock-...",
      "specHash": "...",
      "items": []
    }
  }
}
```

### Retention

- Session lock state can expire with dynamic SDD turn/session retention.
- Dogfood-derived proposals follow dogfood retention rules.
- Source review metadata follows source registry weekly review cadence.

### Privacy

Store summaries and hashes, not raw prompts or raw private paths. Diff snippets should be minimized. Secrets must never be persisted.

## Trust boundaries

| Boundary | Risk | Control |
| --- | --- | --- |
| User prompt → Working Spec | Ambiguous or overbroad requirements | Agent records assumptions; critical contradictions stop. |
| Working Spec → Requirement Lock | Over-locking soft scope | Priority classification and Spec Delta path. |
| File diff → FeatureChange | False positives and private data exposure | Pattern ids, relative paths, minimal summaries. |
| External source → SourceCandidate | Malicious or incompatible code | No auto-adopt without review, license/security scoring. |
| Dogfood case → PatchProposal | Privacy leakage | Sanitized flow data only. |

## Failure modes and mitigations

| Failure mode | Mitigation |
| --- | --- |
| Lock generated for vague scope item blocks completion | Classify as SHOULD unless acceptance-critical or explicit MUST. |
| Agent verifies wrong thing | Evidence must map to lock item ids and acceptance text. |
| Detector misses semantic deletion | Dogfood miss creates future detector pattern proposal. |
| Detector blocks intentional refactor | Accepted Spec Delta explains deletion and unblocks. |
| Large diff overwhelms detector | Summarize as large-deletion/high risk and require review. |
| External source scoring becomes performative | Require source provenance, score rationale, and reversal trigger. |

## Consistency constraints

- Requirement lock must never mutate the Working Spec silently.
- Spec Delta remains the only scope-change mechanism.
- `structural_gate` remains the final completion authority.
- P0 must not require a new persistent work mode.
- Existing approval-boundary routing must continue to block irreversible actions.

## API and UI impact

### No public breaking API in P0

P0 should extend existing tools and diagnostics rather than add a new user-facing command unless necessary.

### Optional future command

A later `/requirements` command may be useful, but P0 can ship without it if `spec_gate list`, `/sessions`, and `structural_gate` diagnostics are sufficient.

## Migration plan

No migration is required for existing sessions. Requirement locks are created only for new or active Working Specs after implementation. Old dynamic SDD state without lock metadata should be treated as unlocked and should not break micro/report turns.
