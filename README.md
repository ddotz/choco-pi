# choco-pi

Personal Pi package for a default-root all-purpose generalist workflow.

`choco-pi` makes Pi treat each user order as one managed project by default: choose reversible defaults, execute across domains, self-review, fix, verify, and report evidence. It keeps Claude/Codex state isolated, uses Pi-native extensions/skills/prompts, and avoids exposing upstream package names in runtime settings.

## Status

- Current package version: `0.12.2`.
- Implemented work modes: `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, `design`.
- Planned work modes: none.
- Execution intensity is separate from work mode: `micro`, `standard`, `deep`.

No built-in mode is currently planned-only. Future planned modes should be documented but not activated until their implementation and tests exist.

## Fresh environment setup

For a new machine or a clean Pi agent directory, install `choco-pi` as a Pi package and then reload or restart Pi.

Git install, after the target revision is pushed:

```bash
pi install git:github.com/ddotz/choco-pi
```

Local checkout install for unreleased or local changes:

```bash
git clone https://github.com/ddotz/choco-pi.git /absolute/path/to/choco-pi
cd /absolute/path/to/choco-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/choco-pi
```

If Pi is already running, run `/reload-runtime` after installation. Otherwise, start Pi normally; Pi loads installed packages from `~/.pi/agent/settings.json`.

## What gets loaded

`package.json` declares the Pi resources explicitly:

- Extensions
  - `extensions/choco-autopilot/index.ts`
  - `extensions/input-newline/index.ts`
  - `extensions/todo-widget.ts`
  - `extensions/choco-footer/index.ts`
  - `extensions/fff-search/index.ts`
  - `node_modules/pi-lsp-client/src/index.ts`
  - `extensions/focus-rendering/index.ts`
  - `extensions/raw-paste/index.ts`
  - `extensions/btw.ts`
- Skills: `skills/`
- Prompt templates: `prompts/`

Selected utility behavior is absorbed as local `choco-pi` extensions so a new environment only needs this package entry.

## Architecture (English)

### 1. Package boundary and load model

`choco-pi` is a Pi package, not a fork of Pi. Pi loads it through the `pi` field in `package.json`, which registers extensions, skills, and prompt templates from this repository. The package keeps runtime behavior local to Pi's extension system and avoids depending on Claude-only runtime state.

```text
Pi runtime
  ├─ package.json pi.extensions[]
  │   ├─ choco-autopilot        # PM loop, guards, state, commands, reload tool
  │   ├─ input-newline          # routes extension text prompts through multiline editor
  │   ├─ todo-widget            # session-scoped todo tool/widget
  │   ├─ choco-footer           # custom two-line footer
  │   ├─ fff-search             # FFF-backed find/grep and @mention search
  │   ├─ pi-lsp-client          # LSP diagnostics/navigation integration
  │   ├─ focus-rendering        # focused tool-output view
  │   ├─ raw-paste              # bracketed raw paste editor mode
  │   └─ btw                    # Korean-localized side conversation overlay
  ├─ package.json pi.skills[]   # skills/choco-autopilot
  └─ package.json pi.prompts[]  # prompts/autopilot.md
```

The core design is layered:

1. **Policy layer**: builds the default-root all-purpose system prompt, runtime reality-correction rules, and runtime constraints.
2. **Guard layer**: blocks or repairs unsafe/incomplete execution.
3. **State layer**: persists mode, intensity, session effective-mode overlays, memory, session-scoped ledgers, source tracking, and custom mode registry.
4. **UI layer**: footer, todo widget, focus view, raw paste, BTW side conversations, and search/editor affordances.
5. **Verification layer**: tests and quality gates enforce behavior before commits.

### 2. Autopilot extension

`extensions/choco-autopilot/index.ts` is the coordination hub. It owns the persistent choco state at:

```text
~/.pi/agent/choco-pi/state.json
```

State schema version `4` stores:

- `runtime`: active work mode and execution intensity.
- `memories`: durable facts explicitly stored by `/memory`.
- `ledgers`: cwd-keyed compact work ledgers.
- `sourceRegistry`: tracked/adopted external sources and weekly check metadata.
- `workModeRegistry`: built-in and custom work-mode metadata, including implemented/planned status.
- `autoUpdate`: choco-pi self-update settings and last check result.

The extension hooks into Pi lifecycle events:

- `before_agent_start`: loads state, creates/updates the context ledger, infers work-mode hints, classifies execution intensity, and appends the choco default-root prompt.
- `tool_call`: applies approval-boundary guards and records changed files for write/edit calls.
- `tool_result`: records verification command results from bash output.
- `session_start`: checks due tracked GitHub sources, runs scheduled choco-pi self-update checks, and sets the mode/intensity/version status indicator.
- `resources_discover`: ensures the external `obra/superpowers` skill repository is available unchanged and contributes it as a skill path.
- `session_shutdown`: removes the mode status indicator.

It also registers user commands:

- `/mode`: status/list/set/add/remove work modes.
- `/intensity`: status/set execution intensity.
- `/effort`: show/set the active model's supported thinking effort levels, plus `auto`.
- `/source`: track, watch, adopt/reject, and check external sources.
- `/memory`: list/save durable memory.
- `/ledger`: show/reset the context ledger.
- `/update`: update choco-pi from upstream and manage automatic self-updates.
- `/reload-runtime`: reload extensions/skills/prompts/themes without starting a new session.

### 3. Hooks

`choco-pi` uses Pi hooks as runtime interception points rather than shell wrappers or external daemons.

| Hook | Owner | Purpose |
| --- | --- | --- |
| `before_agent_start` | `choco-autopilot` | Inject default-root all-purpose policy, current mode/intensity, ledger summary, and source-tracking context. |
| `tool_call` | `choco-autopilot` | Guard dangerous tool calls before execution; record edit/write paths for the ledger. |
| `tool_result` | `choco-autopilot` | Capture verification commands and pass/fail evidence into the ledger. |
| `message_end` | `structural-gate` | Fail closed if a non-trivial turn tries to finish without passing the structural gate, and reopen when the final text still asserts an active/current todo remains. |
| `session_start` | multiple extensions | Rehydrate state, install UI widgets/footer/editor components, clear current-session todos on `/new`, and update runtime status. |
| `session_shutdown` | multiple extensions | Dispose UI/status/editor patches and clear per-session references. |
| `agent_start` | `focus-rendering` | Keep Pi's built-in working indicator hidden while the focused tool view is active. |
| `resources_discover` | Pi package loader, `choco-autopilot` | Pi discovers package skills/prompts/themes from `package.json`; runtime reload re-runs discovery. `choco-autopilot` clones `https://github.com/obra/superpowers.git` unchanged when missing and adds it as a skill path. |

Hook order matters mainly for UI and guard behavior: guards must run before tool execution, structural completion checks must run at assistant `message_end`, and UI components are reinstalled on each `session_start` because `/new`, `/resume`, `/fork`, and `/reload` replace extension runtime bindings.

### 4. Guards

The guard system is explicit and fail-closed where practical.

#### Approval-boundary guard

`approval-boundary.ts` classifies tool calls before execution. It blocks:

- production deployment and package publishing,
- payment/billing actions,
- secret, credential, token, or account mutations,
- large or destructive deletions,
- external private-data transfer,
- irreversible local or infrastructure operations.

This guard runs in the `tool_call` hook and returns `{ block: true }` with a reason when a hard approval boundary is hit.

#### Dynamic SDD guard

`dynamic-sdd.ts` registers the `spec_gate` tool. It keeps a per-turn Working Spec, records Spec Deltas discovered during execution, and stores boundary snapshots for review.

Use it for non-trivial feature, behavior, mode, runtime, or multi-file work:

- `start`: capture objective, scope, acceptance criteria, test strategy, and risks.
- `delta`: record new facts or constraints with explicit handling (`in-scope`, `deferred`, `new-steering`, `new-loop`, or `approval-boundary`).
- `snapshot`: capture the accepted spec at a boundary.
- `list` / `clear`: inspect or reset the turn-local spec state.

Dynamic SDD does not replace TDD. The Working Spec defines what should be built; tests and verification prove the behavior. Deferred/new-loop/new-steering/approval-boundary deltas do not mutate the accepted active scope.

#### Structural gate guard

`structural-gate.ts` registers two tools:

- `loop_transition`: records that a plan/todo boundary was crossed deliberately.
- `structural_gate`: records the final acceptance/runtime/failure/verification/loop/completion review.

For non-trivial turns, the `message_end` hook checks whether the gate passed. If it did not pass, the final assistant message is replaced with a short visible status message and a hidden repair follow-up is queued. Medium confidence is treated as not complete.

After a gate passes, the final-message continuation guard still scans status-assertion lines for active/current/pending/remaining todo or in-scope work. If the final answer claims that such work remains, Pi reopens the loop with a follow-up instead of stopping at Ready. Explicitly deferred, blocked, optional, new-scope, completed, or empty-active-todo lines are excluded to avoid self-triggering on explanatory text.

#### Loop-governance guard

The structural gate tracks completed todo steps and loop transitions. If a todo is marked done but no `loop_transition` is recorded before crossing to the next step or final answer, the gate fails. If new work appears after a completed todo, the gate requires explicit handling: deferred, new steering, new loop, or approval boundary. The todo tool also refuses accidental `clear`/`remove` of active todos unless a destructive override is explicitly provided, so parent todos remain resumable after dependent work finishes.

#### Completion-boundary guard

`completion-boundary.ts` distinguishes required in-scope work from optional or new-scope follow-ups. Autonomous execution continues only for unmet requested outcomes, failed verification, or critical in-scope issues; it stops at approval boundaries and does not silently expand scope.

#### Commit-hygiene and version-sync guards

`commit-hygiene.ts` classifies paths before commits and excludes secrets, private files, generated artifacts, caches, logs, Superpowers runtime artifacts, and unneeded dotfiles. `scripts/check-version-sync.ts` keeps `package.json` and `extensions/choco-autopilot/version.ts` synchronized when a version bump is chosen.

### 5. Work modes and execution intensity

Work mode and intensity are intentionally separate.

- **Work mode** is a policy overlay. `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, and `design` are implemented; no built-in modes remain planned.
- **Execution intensity** controls process weight: `micro`, `standard`, or `deep`.

Mode files live under:

```text
modes/_base/MODE.md
modes/default/MODE.md
modes/<planned-mode>/MODE.md
```

Custom modes created with `/mode add` are stored under:

```text
~/.pi/agent/choco-pi/modes/<mode-id>/MODE.md
```

Future planned modes can be listed and registered, but they must not be activated unless implementation and tests are added later.

### 6. Context ledger, memory, and source registry

The context ledger is compact workspace state, keyed by cwd. It records:

- objective,
- assumptions,
- decisions,
- changed files,
- verification commands and status,
- blockers,
- risks,
- next actions.

The ledger is automatically updated from tool hooks: write/edit tool calls add changed files, and verification-like bash commands add pass/fail evidence. `/ledger reset` clears the current cwd ledger.

Memory is durable and explicit. `/memory save` stores only durable facts; temporary logs and one-off chatter should not be stored.

The source registry tracks only adopted or explicitly tracked external sources. GitHub sources are checked weekly with `git ls-remote`; changed sources are surfaced in the autopilot prompt for autonomous adopt/partial-adopt/reject decisions.

### 7. Advanced PRD architect

`skills/prd-architect` provides senior-level PRD and product-requirements work. It is triggered by PRD, 기획서, 제품기획, product requirements, and product spec requests.

PRD Architect does not replace brainstorming. It sits after exploration: a fuzzy idea should be explored through brainstorming first, while a clear direction or existing PRD can go directly into `prd-architect`.

```text
Fuzzy idea → brainstorming first → prd-architect
clear direction → prd-architect directly
existing PRD → prd-architect directly
PRD → spec_gate start → implementation plan → TDD
```

The skill deliberately avoids beginner interview flows. It analyzes existing context first, proceeds with explicit assumptions, asks critical questions only, and produces deep PRD document sets that can seed dynamic SDD:

```text
01_PRD.md
02_SYSTEM_MODEL.md
03_DELIVERY_PLAN.md
04_AGENT_SPEC.md
README.md
```

The design adapts idea-level patterns from `fivetaku/show-me-the-prd` — coherent multi-document PRD output, gap analysis, research-backed decisions, and domain-specific document sets — while rejecting Claude-only plugin mechanics, AskUserQuestion-first flow, and beginner-friendly simplification.

### 8. Dogfooding quality system and self-improvement loop

`choco-pi` records privacy-preserving cross-project quality cases under `~/.pi/agent/choco-pi/dogfood/`. It does not store raw prompt text by default. Each case stores a salted prompt hash, safe project label, work mode, task type, tool counts, verification signals, structural gate signals, scope metadata, sanitized flow signals, and a deterministic `clean / assisted / miss / review` outcome.

This dogfood layer is the first implemented slice of the self-improvement loop:

1. **Observe safely**: capture only eligible cases, with Git-root project scope, `~/` global-readonly recall, and non-Git default-off behavior elsewhere.
2. **Score deterministically**: classify outcomes from observable evidence such as verification commands, structural gates, loop transitions, and repair events.
3. **Mine repeated flows**: aggregate repeated assisted/miss patterns and top sanitized tool/command flow signatures in weekly reports.
4. **Gate improvement**: allow auto-improvement only after minimum sample and repeated-pattern thresholds pass.
5. **Quarantine future generation**: generated skills or policy changes must remain draft-only until deterministic eval, structural gate, canary, and human-visible review paths exist.

Self-improvement capture is controlled by environment variables:

| Variable | Values | Behavior |
| --- | --- | --- |
| `CHOCO_PI_IMPROVEMENT_MODE` | `off`, `readonly`, `manual`, `auto` | `auto` stores eligible dogfood cases. `off`, `readonly`, and `manual` do not auto-store cases. `manual` is reserved for explicit future capture flows. |
| `CHOCO_PI_IMPROVEMENT_PROFILE` | `personal`, `scratch` | Opts into non-project capture scopes. Without this, `~/` resolves to global readonly recall, while Downloads, `/tmp`, missing paths, and other non-Git directories resolve to capture off. |

`~/` is a special global-memory read scope: stored global memories are injected into the prompt as readonly recall, but memory saves and dogfood capture are blocked there by default. Project identity is derived from the Git root, not the current subdirectory. The stored project id and root hash are hashed; the raw Git root path is not stored. Reports use a safe project label. Flow mining stores tool names and command classes such as `test`, `lint`, `typecheck`, `git`, `web-fetch`, and `other`; it does not store raw commands, command arguments, tool output, raw prompts, or private paths.

Use `/dogfood status` to see the current week sample count, `/dogfood weekly` to generate a deterministic weekly report, `/dogfood report` to show the latest report, `/dogfood queue` to inspect ambiguous cases, and `/dogfood explain <id>` to explain a case without raw prompt text.

Auto-improvement requires at least 25 eligible weekly cases and at least 3 repeated assisted/miss cases for the same pattern. The current loop does not run hidden background LLM judging, does not create active skills automatically, and does not store raw prompt/tool output.

### 9. Todo subsystem

`extensions/todo-widget.ts` registers the `todo` tool and `/todos` UI. Todos are session-local by default so multiple Pi sessions in the same cwd do not overwrite each other:

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

Deliberate shared todos remain available with `scope: "project"`:

```text
<cwd>/.pi/todos.json
```

Persistence rules:

- schema is validated on every load,
- missing files resolve to an empty todo state,
- writes use atomic temp-file rename,
- temp file names include `randomUUID()` to avoid same-tick collisions,
- path-level async locks serialize concurrent tool calls and prevent lost updates,
- `session_start(reason: "new")` clears only the current session todos so `/new` starts clean without touching sibling sessions.

The tool renderer is intentionally empty so tool calls stay visually quiet while the widget reflects todo state.

### 10. Footer subsystem

`extensions/choco-footer/` replaces Pi's footer with a two-line footer:

```text
<model> | ⎇ <branch> v<version> | <cwd> | ◉ <thinking>
  <mode> | 5h:<usage> wk:<usage> | ctx <percent> | <cost> | tools:<n> | todo <done/total> | <run-state>
```

Data sources:

- model/provider from `ctx.model`,
- branch from Pi footer data, then `git -C <cwd>`, then the choco-pi repo fallback,
- version from `package.json`,
- mode from `~/.pi/agent/choco-pi/state.json`,
- todo summary from `<cwd>/.pi/sessions/<sessionId>/todos.json`,
- run state from agent/tool lifecycle hooks,
- Codex rate limits from `codex app-server --listen stdio://`,
- Claude usage from existing Claude cache files when the active provider is Anthropic.

The footer caches expensive probes and truncates each line to the terminal width.

### 11. Focus view / focus rendering

`extensions/focus-rendering/index.ts` implements the focused tool-output view. It patches Pi's `ToolExecutionComponent` prototype at runtime because the built-in renderer owns tool block layout.

Responsibilities:

- normalize each visible tool block to one external spacer,
- restore default inner padding for visible tool boxes,
- wrap result renderers so large tool outputs are hidden by default,
- preserve useful footer lines such as truncation notices, continuation hints, match limits, and elapsed time,
- keep explicit renderer output when it is meaningful,
- suppress fully empty self-rendering tool blocks such as silent todo calls,
- hide Pi's built-in working indicator via `ctx.ui.setWorkingVisible(false)` while the focused view is active,
- restore the working indicator on `session_shutdown`.

This is a UI-only layer: it does not mutate tool results or session content. It changes how results are rendered in the TUI so the agent can keep context-rich tool output available while the user sees a compact, focused view.

### 12. Search, paste, and editor helpers

`extensions/fff-search/` replaces built-in `find` and `grep` tools with FFF-backed search and can replace `@`-mention autocomplete in the editor. It stores FFF frecency/history/config under:

```text
~/.pi/agent/fff/
```

`extensions/input-newline/` treats choco-pi as one coherent Pi environment by routing extension text prompts through Pi's multiline editor. `Ctrl+J` follows the same newline behavior as the main prompt instead of being interpreted as a single-line submit.

`extensions/raw-paste/` owns the editor component for bracketed paste. `/paste` arms raw paste mode so the next bracketed paste is inserted into the editor as visible text instead of being interpreted as keystroke commands. `/paste cancel` disarms it.

`extensions/btw.ts` owns `/btw` side conversations as a local choco-pi feature. It is adapted from `pi-btw` under MIT license, localized for Korean respectful side-session answers, and no longer needs a separate `npm:pi-btw` package entry.

`pi-lsp-client` is loaded as a package dependency and supplies LSP diagnostics/navigation tools.

### 13. Runtime reload

`runtime-reload.ts` provides `/reload-runtime` and the LLM-callable `reload_runtime` tool. Preferred behavior is direct `ctx.reload()`. When direct reload is unavailable from a tool context, it self-submits `/reload-runtime --continue` through tmux and writes a resume marker. After reload, `session_start(reason: "reload")` claims the marker and sends `continue` as a follow-up message.

This keeps extension changes, skills, prompts, and themes reloadable without starting a new conversation session.

### 14. Verification architecture

The default quality gate is:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Tests are organized by subsystem: approval boundary, completion boundary, commit hygiene, context ledger, footer core, extension commands, FFF formatting, focus rendering, memory, package config, policy, raw paste, runtime reload, source registry, structural gate, todo widget, version sync, and work-mode registry.

## 아키텍처 (한국어)

### 1. 패키지 경계와 로드 모델

`choco-pi`는 Pi 포크가 아니라 Pi 패키지입니다. Pi는 `package.json`의 `pi` 필드를 읽어 이 저장소의 extension, skill, prompt template을 로드합니다. 런타임 동작은 Pi extension 시스템 안에 두고, Claude 전용 런타임 상태에는 의존하지 않습니다.

```text
Pi runtime
  ├─ package.json pi.extensions[]
  │   ├─ choco-autopilot        # PM 루프, guard, 상태, 명령, reload tool
  │   ├─ input-newline          # extension text prompt를 multiline editor로 라우팅
  │   ├─ todo-widget            # 세션 격리 todo tool/widget
  │   ├─ choco-footer           # 2줄 footer
  │   ├─ fff-search             # FFF 기반 find/grep 및 @mention 검색
  │   ├─ pi-lsp-client          # LSP diagnostics/navigation
  │   ├─ focus-rendering        # focused tool-output view
  │   ├─ raw-paste              # bracketed raw paste editor mode
  │   └─ btw                    # Korean-localized side conversation overlay
  ├─ package.json pi.skills[]   # skills/choco-autopilot
  └─ package.json pi.prompts[]  # prompts/autopilot.md
```

계층 구조는 다음과 같습니다.

1. **Policy layer**: default-root all-purpose system prompt와 런타임 제약을 생성합니다.
2. **Guard layer**: 위험하거나 불완전한 실행을 차단하거나 복구합니다.
3. **State layer**: mode, intensity, session effective-mode overlay, memory, session-scoped ledger, source tracking, custom mode registry를 저장합니다.
4. **UI layer**: footer, todo widget, focus view, raw paste, BTW side conversation, search/editor 편의 기능을 제공합니다.
5. **Verification layer**: 테스트와 품질 게이트로 커밋 전 동작을 검증합니다.

### 2. Autopilot extension

`extensions/choco-autopilot/index.ts`가 전체 조정 허브입니다. choco 상태는 아래 파일에 저장됩니다.

```text
~/.pi/agent/choco-pi/state.json
```

state schema version `4`는 다음을 저장합니다.

- `runtime`: 현재 work mode와 execution intensity.
- `memories`: `/memory`로 명시 저장한 durable fact.
- `ledgers`: cwd별 compact work ledger.
- `sourceRegistry`: 추적/채택한 외부 source와 주간 체크 메타데이터.
- `workModeRegistry`: built-in/custom work-mode 메타데이터와 implemented/planned 상태.
- `autoUpdate`: choco-pi self-update 설정과 마지막 체크 결과.

주요 Pi hook 연결은 다음과 같습니다.

- `before_agent_start`: state를 읽고, context ledger를 생성/갱신하고, work-mode hint와 execution intensity를 계산한 뒤 default-root prompt를 추가합니다.
- `tool_call`: approval-boundary guard를 적용하고 write/edit 경로를 ledger에 기록합니다.
- `tool_result`: bash 검증 명령 결과를 ledger에 기록합니다.
- `session_start`: due 상태인 GitHub source를 체크하고, 예약된 choco-pi self-update를 실행하고, mode/intensity/version status를 설정합니다.
- `resources_discover`: 외부 `obra/superpowers` skill repository를 원본 그대로 보장하고 skill path로 제공합니다.
- `session_shutdown`: status indicator를 제거합니다.

등록 명령은 `/mode`, `/intensity`, `/effort`, `/source`, `/memory`, `/ledger`, `/update`, `/reload-runtime`입니다.

### 3. Hook 구조

`choco-pi`는 shell wrapper나 외부 daemon 대신 Pi hook을 런타임 interception point로 사용합니다.

| Hook | 담당 | 역할 |
| --- | --- | --- |
| `before_agent_start` | `choco-autopilot` | default-root all-purpose policy, 현재 mode/intensity, ledger summary, source-tracking context 주입. |
| `tool_call` | `choco-autopilot` | tool 실행 전 위험 호출 차단, edit/write 경로 ledger 기록. |
| `tool_result` | `choco-autopilot` | 검증 명령과 pass/fail evidence를 ledger에 기록. |
| `message_end` | `structural-gate` | non-trivial turn이 structural gate 없이 끝나면 fail-closed 처리하고, 최종 문장이 active/current todo 잔존을 상태로 주장하면 재개. |
| `session_start` | 여러 extension | state 복원, UI widget/footer/editor 설치, `/new` current-session todo clear, runtime status 갱신. |
| `session_shutdown` | 여러 extension | UI/status/editor reference 정리. |
| `agent_start` | `focus-rendering` | focused view 활성 시 Pi 기본 working indicator 숨김. |
| `resources_discover` | Pi package loader, `choco-autopilot` | `package.json`의 skills/prompts/themes 재발견; runtime reload 때 다시 실행. `choco-autopilot`은 미설치 환경에서 `https://github.com/obra/superpowers.git`을 원본 그대로 clone하고 skill path를 추가합니다. |

`/new`, `/resume`, `/fork`, `/reload`는 extension runtime binding을 바꾸므로 UI component는 `session_start`에서 다시 설치하고 `session_shutdown`에서 정리합니다.

### 4. Guard 구조

Guard는 명시적이고, 가능한 곳에서는 fail-closed로 동작합니다.

#### Approval-boundary guard

`approval-boundary.ts`는 tool 실행 전에 위험 호출을 분류합니다. 차단 대상은 다음입니다.

- production deployment 및 package publishing,
- payment/billing action,
- secret, credential, token, account 변경,
- 큰 삭제 또는 파괴적 삭제,
- 외부 private-data transfer,
- 되돌리기 어려운 local/infrastructure operation.

이 guard는 `tool_call` hook에서 `{ block: true }`를 반환해 실행을 막습니다.

#### Dynamic SDD guard

`dynamic-sdd.ts`는 `spec_gate` tool을 등록합니다. 이 tool은 turn 단위 Working Spec, 작업 중 발견된 Spec Delta, 경계 snapshot을 기록합니다.

non-trivial feature, behavior, mode, runtime, multi-file 작업에서 사용합니다.

- `start`: objective, scope, acceptance criteria, test strategy, risks를 기록합니다.
- `delta`: 새 사실이나 제약을 `in-scope`, `deferred`, `new-steering`, `new-loop`, `approval-boundary` 중 하나로 명시 처리합니다.
- `snapshot`: 경계 시점의 accepted spec을 캡처합니다.
- `list` / `clear`: 현재 turn의 spec state를 확인하거나 초기화합니다.

Dynamic SDD는 TDD를 대체하지 않습니다. Working Spec은 무엇을 만들지 정의하고, 테스트와 검증은 동작을 증명합니다. `deferred`, `new-loop`, `new-steering`, `approval-boundary` delta는 accepted active scope를 변경하지 않습니다.

#### Structural gate guard

`structural-gate.ts`는 두 tool을 등록합니다.

- `loop_transition`: plan/todo step boundary를 의도적으로 넘었다는 기록.
- `structural_gate`: 최종 acceptance/runtime/failure/verification/loop/completion review 기록.

non-trivial turn에서 gate가 통과되지 않으면 `message_end` hook이 최종 assistant message를 짧은 표시용 상태 메시지로 교체하고 hidden repair follow-up을 큐에 넣습니다. `Medium` confidence는 완료 상태가 아닙니다.

Gate가 통과한 뒤에도 final-message continuation guard가 상태 주장 라인에서 active/current/pending/remaining todo 또는 남은 in-scope 작업 표현을 다시 확인합니다. 최종 답변이 그런 작업이 남았다고 주장하면 Ready에서 멈추지 않고 follow-up으로 루프를 재개합니다. 명시적 deferred, blocked, optional, new-scope, 완료, active todo 없음 표현은 제외해 설명 문장 오탐을 줄입니다.

#### Loop-governance guard

Structural gate는 todo 완료와 loop transition 수를 추적합니다. todo를 `done`으로 바꾼 뒤 다음 step이나 final로 넘어가기 전에 `loop_transition`이 없으면 gate가 실패합니다. 완료된 todo 이후 새 작업이 생기면 deferred, new steering, new loop, approval boundary 중 하나로 명시 처리해야 합니다. todo tool은 active todo의 우발적 `clear`/`remove`를 destructive override 없이는 거부하므로, 의존 작업이 끝난 뒤 parent todo로 복귀할 수 있습니다.

#### Completion-boundary guard

`completion-boundary.ts`는 in-scope required work와 optional/new-scope follow-up을 구분합니다. 요청 결과 미충족, 검증 실패, 현재 작업이 만든 critical issue가 있을 때만 계속 진행하고, approval boundary에서는 멈춥니다.

#### Commit-hygiene / version-sync guard

`commit-hygiene.ts`는 커밋 전 path risk를 분류합니다. secret/private file, generated artifact, cache, log, Superpowers runtime artifact, 불필요한 dotfile은 제외합니다. `scripts/check-version-sync.ts`는 버전 bump 시 `package.json`과 `extensions/choco-autopilot/version.ts`를 동기화합니다.

### 5. Work mode와 execution intensity

Work mode와 execution intensity는 분리되어 있습니다.

- **Work mode**: policy overlay입니다. 현재 구현된 mode는 `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, `design`이며 planned built-in mode는 없습니다.
- **Execution intensity**: 처리 강도입니다. `micro`, `standard`, `deep` 중 하나입니다.

mode file 위치는 다음입니다.

```text
modes/_base/MODE.md
modes/default/MODE.md
modes/<planned-mode>/MODE.md
```

`/mode add`로 만든 custom mode는 아래에 저장됩니다.

```text
~/.pi/agent/choco-pi/modes/<mode-id>/MODE.md
```

향후 planned mode는 등록/표시는 가능하지만, 구현과 테스트 전에는 활성화하지 않습니다.

### 6. Context ledger, memory, source registry

Context ledger는 cwd별 compact workspace state입니다. 기록 항목은 objective, assumptions, decisions, changed files, verification commands/status, blockers, risks, next actions입니다.

ledger는 hook에서 자동 갱신됩니다. write/edit tool call은 changed file을 추가하고, 검증성 bash command는 pass/fail evidence를 추가합니다. `/ledger reset`은 현재 cwd ledger를 초기화합니다.

Memory는 명시적으로 저장하는 durable state입니다. `/memory save`는 장기적으로 유효한 사실만 저장하는 용도입니다.

Source registry는 실제로 채택했거나 사용자가 명시적으로 추적 요청한 외부 source만 기록합니다. 신규 Pi 기능 요청은 먼저 https://pi.dev/packages 에서 유사 패키지를 확인하고, 높은 유사도의 패키지가 있으면 source/license/security를 검토한 뒤 fork/clone 기반으로 커스터마이징합니다. GitHub source는 주 1회 `git ls-remote`로 확인하고, 변경된 source는 autopilot prompt에 포함되어 adopt / partially adopt / reject 판단을 유도합니다.

### 7. Advanced PRD architect

`skills/prd-architect`는 고급 사용자용 PRD/product requirements 작업을 담당합니다. PRD, 기획서, 제품기획, product requirements, product spec 요청에서 활성화됩니다.

PRD Architect does not replace brainstorming. 이 skill은 탐색 이후의 수렴 단계입니다. fuzzy idea는 brainstorming first로 방향을 잡고, clear direction 또는 existing PRD는 `prd-architect`로 바로 구체화합니다.

```text
Fuzzy idea → brainstorming first → prd-architect
clear direction → prd-architect directly
existing PRD → prd-architect directly
PRD → spec_gate start → implementation plan → TDD
```

이 skill은 초보자용 인터뷰 흐름을 의도적으로 피합니다. 먼저 기존 맥락을 분석하고, 명시적 assumption으로 자동 진행하며, critical 질문만 묻고, dynamic SDD로 바로 넘길 수 있는 deep PRD 문서 세트를 생성합니다.

```text
01_PRD.md
02_SYSTEM_MODEL.md
03_DELIVERY_PLAN.md
04_AGENT_SPEC.md
README.md
```

설계는 `fivetaku/show-me-the-prd`에서 multi-document PRD, gap analysis, research-backed decision, domain-specific document set 아이디어만 채택하고, Claude-only plugin 구조, AskUserQuestion-first 흐름, 초보자용 단순화는 거절합니다.

### 8. Dogfooding quality system and self-improvement loop

`choco-pi`는 cross-project 품질 case를 `~/.pi/agent/choco-pi/dogfood/` 아래에 privacy-preserving 형태로 기록합니다. 기본적으로 raw prompt text는 저장하지 않습니다. 각 case는 salted prompt hash, 안전한 project label, work mode, task type, tool count, verification signal, structural gate signal, scope metadata, sanitized flow signal, deterministic `clean / assisted / miss / review` outcome을 저장합니다.

이 dogfood layer가 자기 개선 루프의 첫 구현 단위입니다.

1. **안전한 관찰**: Git root 기반 project scope에서만 eligible case를 자동 기록하고, `~/`는 global readonly recall로 두며, 나머지 non-Git 위치는 기본 capture off로 둡니다.
2. **결정적 채점**: verification command, structural gate, loop transition, repair event 같은 관찰 가능한 증거로 `clean / assisted / miss / review`를 분류합니다.
3. **반복 flow 발굴**: 주간 report에서 반복 assisted/miss pattern과 sanitized tool/command flow signature를 집계합니다.
4. **개선 gate**: 최소 sample 수와 반복 pattern 기준을 통과해야만 auto-improvement가 허용됩니다.
5. **향후 생성물 격리**: 자동 생성 skill이나 policy 변경은 deterministic eval, structural gate, canary, 사람이 볼 수 있는 review 경로가 생길 때까지 draft/quarantine 상태여야 합니다.

자기 개선 capture는 아래 환경 변수로 제어합니다.

| Variable | Values | Behavior |
| --- | --- | --- |
| `CHOCO_PI_IMPROVEMENT_MODE` | `off`, `readonly`, `manual`, `auto` | `auto`만 eligible dogfood case를 저장합니다. `off`, `readonly`, `manual`은 자동 저장하지 않습니다. `manual`은 향후 명시 capture flow용으로 예약되어 있습니다. |
| `CHOCO_PI_IMPROVEMENT_PROFILE` | `personal`, `scratch` | project가 아닌 capture scope를 명시 opt-in합니다. 이 값이 없으면 `~/`는 global readonly recall이고, Downloads, `/tmp`, 존재하지 않는 경로, 기타 non-Git directory는 capture off입니다. |

`~/`는 전역 메모리 읽기 전용 scope입니다. 저장된 global memory는 readonly recall로 prompt에 주입되지만, 해당 위치에서는 memory save와 dogfood capture가 기본 차단됩니다. Project identity는 현재 subdirectory가 아니라 Git root에서 계산합니다. 저장되는 project id와 root hash는 hash이고, raw Git root path는 저장하지 않습니다. report에는 안전한 project label만 사용합니다. Flow mining은 `test`, `lint`, `typecheck`, `git`, `web-fetch`, `other` 같은 command class와 tool name만 저장합니다. raw command, command argument, tool output, raw prompt, private path는 저장하지 않습니다.

`/dogfood status`는 현재 주 sample count를 보여주고, `/dogfood weekly`는 deterministic weekly report를 생성하며, `/dogfood report`는 최신 report를 표시합니다. `/dogfood queue`는 애매한 case 수를 보여주고, `/dogfood explain <id>`는 raw prompt text 없이 case 판정 이유를 설명합니다.

자동 개선은 주간 eligible case 25개 이상, 같은 assisted/miss pattern 3회 이상일 때만 허용됩니다. 현재 루프는 hidden background LLM judging을 실행하지 않고, active skill을 자동 생성하지 않으며, raw prompt/tool output도 저장하지 않습니다.

### 9. Todo subsystem

`extensions/todo-widget.ts`는 `todo` tool과 `/todos` UI를 등록합니다. todo 파일은 기본적으로 Pi 세션별로 저장되어 같은 cwd의 멀티세션이 서로 덮어쓰지 않습니다.

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

명시적으로 공유가 필요하면 `scope: "project"`로 프로젝트 공용 todo를 사용합니다.

```text
<cwd>/.pi/todos.json
```

저장 규칙은 다음입니다.

- load마다 schema 검증,
- 파일이 없으면 empty state,
- atomic temp-file rename,
- 같은 tick 충돌 방지를 위한 `randomUUID()` temp filename,
- 동시 tool call의 lost update 방지를 위한 path-level async lock,
- `/new`에서 깨끗하게 시작하도록 `session_start(reason: "new")` 때 current-session todo만 clear.

렌더러는 비워 두어 tool call block은 조용히 숨기고 widget만 갱신합니다.

### 10. Footer subsystem

`extensions/choco-footer/`는 Pi footer를 2줄 footer로 교체합니다.

```text
<model> | ⎇ <branch> v<version> | <cwd> | ◉ <thinking>
  <mode> | 5h:<usage> wk:<usage> | ctx <percent> | <cost> | tools:<n> | todo <done/total> | <run-state>
```

데이터 source는 다음입니다.

- `ctx.model`의 model/provider,
- Pi footer branch data → `git -C <cwd>` → choco-pi repo branch fallback,
- `package.json` version,
- `~/.pi/agent/choco-pi/state.json` mode,
- `<cwd>/.pi/sessions/<sessionId>/todos.json` todo summary,
- agent/tool lifecycle hook 기반 run state,
- `codex app-server --listen stdio://` 기반 Codex rate limit,
- Anthropic provider일 때 Claude cache 기반 usage.

비싼 probe는 cache하고, 각 line은 terminal width에 맞춰 truncate합니다.

### 11. Focus view / focus rendering

`extensions/focus-rendering/index.ts`가 focused tool-output view를 구현합니다. Pi의 built-in renderer가 tool block layout을 소유하므로 runtime에서 `ToolExecutionComponent` prototype을 patch합니다.

역할은 다음입니다.

- visible tool block의 external spacer를 1개로 정규화,
- visible tool box의 기본 inner padding 복원,
- result renderer를 감싸 큰 tool output body를 기본 숨김 처리,
- truncation notice, continuation hint, match limit, elapsed time 같은 유용한 footer line 보존,
- 의미 있는 explicit renderer output 유지,
- silent todo처럼 self-rendering 결과가 완전히 빈 tool block은 숨김,
- focused view 활성 중 `ctx.ui.setWorkingVisible(false)`로 Pi 기본 working indicator 숨김,
- `session_shutdown`에서 working indicator 복원.

이 계층은 UI-only입니다. tool result나 session content를 바꾸지 않고, TUI에서 보이는 방식만 compact/focused하게 바꿉니다.

### 12. Search, paste, editor helper

`extensions/fff-search/`는 built-in `find`/`grep`을 FFF 기반으로 대체하고 editor `@`-mention autocomplete도 대체할 수 있습니다. FFF frecency/history/config는 아래에 저장됩니다.

```text
~/.pi/agent/fff/
```

`extensions/input-newline/`은 choco-pi를 하나의 Pi 환경으로 다루기 위해 extension text prompt를 Pi multiline editor로 라우팅합니다. 그래서 `Ctrl+J`가 단일행 submit으로 해석되지 않고 main prompt와 같은 newline 동작을 따릅니다.

`extensions/raw-paste/`는 bracketed paste용 editor component를 소유합니다. `/paste`는 다음 bracketed paste를 arm해서 keystroke command가 아니라 editor text로 삽입하게 하고, `/paste cancel`은 해제합니다.

`extensions/btw.ts`는 `/btw` side conversation을 choco-pi 로컬 기능으로 소유합니다. MIT 라이선스의 `pi-btw`에서 흡수하되 한국어 존댓말 side-session 답변에 맞게 로컬라이즈했으며, 별도 `npm:pi-btw` package entry는 필요하지 않습니다.

`pi-lsp-client`는 package dependency로 로드되어 LSP diagnostics/navigation tool을 제공합니다.

### 13. Runtime reload

`runtime-reload.ts`는 `/reload-runtime`과 LLM-callable `reload_runtime` tool을 제공합니다. 가능한 경우 `ctx.reload()`를 직접 호출합니다. tool context에서 직접 reload가 어려우면 tmux로 `/reload-runtime --continue`를 self-submit하고 resume marker를 씁니다. reload 이후 `session_start(reason: "reload")`가 marker를 claim하고 `continue` follow-up message를 보냅니다.

이 구조 덕분에 새 conversation session을 만들지 않고 extension, skill, prompt, theme 변경을 반영할 수 있습니다.

### 14. Verification architecture

기본 품질 게이트는 다음입니다.

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

테스트는 subsystem별로 나뉩니다. approval boundary, completion boundary, commit hygiene, context ledger, footer core, extension commands, FFF formatting, focus rendering, memory, package config, policy, raw paste, runtime reload, source registry, structural gate, todo widget, version sync, work-mode registry를 검증합니다.

## Commands

- `/mode` — open the interactive work-mode selector with each mode description.
- `/mode [status|list|set <mode>|add <id> <description>|remove <id>]` — manage work modes. `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, and `design` are implemented modes.
- `/intensity [micro|standard|deep|status]` — show or set process weight.
- `/effort [<available-level>|auto]` — show or set the current model's supported thinking effort levels dynamically; unsupported provider-specific levels are omitted from completions.
- `/source [list|add|watch|adopt|reject|due|changed|check]` — track adopted, watched, or explicitly tracked external sources.
- `/btw`, `/btw:new`, `/btw:tangent`, `/btw:inject`, `/btw:summarize`, `/btw:clear`, `/btw:model`, `/btw:thinking` — run Korean-localized side conversations in a focused overlay without installing `npm:pi-btw` separately.
- `/memory [list|save <text>]` — list/save durable memories.
- `/ledger [reset]` — show/reset the compact workspace Context Ledger.
- `/update [now|status|auto on|auto off|auto status]` — fast-forward choco-pi from its upstream branch, run dependency install/version sync when needed, reload the runtime after successful updates, and report automatic update state.
- `/reload-runtime` — reload extensions, skills, prompts, and themes without starting a new session. The LLM-callable `reload_runtime` tool self-submits `/reload-runtime --continue` through tmux when direct tool reload is unavailable, waits for the command acknowledgement marker, then the reloaded extension sends `continue` from `session_start(reason: "reload")`.

## Mode folder structure

```text
modes/
  _base/MODE.md                # shared default-root invariants and structural gates
  default/MODE.md              # root all-purpose generalist mode
  coding/MODE.md               # implemented TDD-first coding overlay
  report/MODE.md               # implemented evidence-led report overlay
  design/MODE.md               # implemented product/UI design overlay
  web-analysis/MODE.md         # implemented web research overlay
  adoption-analysis/MODE.md    # implemented source adoption overlay
```

Custom modes use the same shape: `modes/<mode-id>/MODE.md`. Runtime-created custom modes are stored under `~/.pi/agent/choco-pi/modes/<mode-id>/MODE.md` and registered by `/mode add`.

## Runtime behavior

- Ask only for hard approval boundaries: production deployment/package publishing, payment, secrets/accounts, large deletion, external private-data transfer, irreversible actions, work mode switching, or contradictory goals without safe defaults.
- For new Pi feature/capability requests, check https://pi.dev/packages before building from scratch. If a high-similarity package exists, inspect source/license/security, fork or clone it as the baseline, and customize it to the user's final requirements.
- Superpowers is treated as an external skill dependency: choco-pi first reuses existing Claude Code/Codex superpowers skill directories when present, otherwise clones `https://github.com/obra/superpowers.git` unchanged under `~/.pi/agent/choco-pi/deps/superpowers`, then exposes only the repo's `skills/` directory via Pi skill discovery.
- Mode isolation is mandatory for every work mode, including future planned and custom modes.
- New mode policies, skills, plugin/extension guidance, processes, priorities, tools, and guardrails must apply only while that mode is active.
- No mode may change default or any other mode as a side effect; shared changes belong in `modes/_base/MODE.md` only when they are mode-agnostic.
- In `default`, autopilot treats the user order as one managed project and may apply an implemented specialized mode as a temporary session-scoped effective overlay for the current turn without persistently changing `/mode`.
- Default parallel strategy is hybrid: writable lanes run in isolated worktrees, read-only lanes may use spawned agents, and shared/integration lanes stay serial.
- Prefer isolated git worktrees for parallel/multi-session work. Todo and ledger state are session-scoped by default; use project-shared todos only when explicitly needed.
- `web-analysis` retrieval/review policy and message-end quality guardrail are active only while that mode is active.
- `adoption-analysis` does not replace default adoption capability; it adds mode-scoped decision, adoption-depth, fit/risk, scope, tracking, and confidence quality guardrails only while active.
- `report` adds mode-scoped evidence ledgers, confidence double-check/triple-check rules, a concrete `kami` skill plus artifact-only Kami-derived layout workflow, and im-not-ai-derived Korean polishing only while active.
- `coding` adds mode-scoped TDD-first execution, systematic debugging, simplicity/surgical-diff discipline, tight verification loops, and coding completion quality guardrails only while active.
- `design` adds mode-scoped product/UI design briefs, artifact-track routing for mobile web/app, desktop web/app, and Presentation slides, anti-slop visual thesis requirements, taste-ko-derived Korean typography/line-break guidance, UX critique, visual systems, browser-backed design QA, and a design quality repair guard only while active.
- The `source_registry` tool is the Pi-native LLM path for autonomous source tracking; use `watch` when a source is relevant but not safe or ready to adopt.
- Commit and push autonomously after verification when the working tree contains intentional in-scope changes and a remote is configured; normal `git push` is routine source synchronization, not deployment.
- Treat each plan/todo step as a bounded loop. Complete a step, verify fit, record `loop_transition`, then move on.
- If new work appears after the current todo, start a new loop or defer it explicitly. Do not silently append scope, and do not clear/remove active parent todos while switching loops.
- Run the structural gate before final completion on non-trivial work.
- For major tasks, after verification passes, run a small in-scope technical-debt cleanup pass and re-run verification before final reporting; the agent decides the major-task threshold.
- Medium confidence is not a completion state; reinforce verification to `High` or report a concrete blocker.

## Language, UI, and reporting

- User-facing conversation must be in Korean by default unless the user requests another language.
- Use respectful Korean (존댓말) with concise `합니다/습니다` or natural `해요` style; do not use 반말.
- Do not use praise or validation openers such as `좋은 질문이에요`, `맞습니다`, or `완전히 맞습니다`.
- Do not end replies with suggestion-led opt-in phrasing such as `원하면 ~해드릴게요`.
- Todo tool calls render silently while the session-scoped todo widget updates.
- Read previews stay header-only while collapsed and expand on demand.
- Footer line 1 shows `⎇ <project-branch> v<project-version>` from the active session cwd and ends with Codex-style run state (`Ready`, `Starting`, `Thinking`, `Working`); it does not fall back to the choco-pi package branch/version when working in another folder. Line 2 starts with the current mode and keeps rate/context/cost/tool/todo details.
- Footer usage values (`5h`, `wk`, `ctx`) highlight only numeric values in cyan.
- Confidence labels are `High`, `Medium`, and `Low`; terminal/UI rendering should use white text on green/yellow/red backgrounds.
- Final Markdown should use plain labels such as `Confidence: High`, not HTML badges.

## External source policy

Do not track links for simple analysis. Track only when:

- the source was actually reflected into `choco-pi`, or
- the user explicitly asks to track it.

Tracked/adopted sources are checked weekly. If upstream changed, the agent analyzes fit, decides adopt / partially adopt / reject against the all-purpose choco-pi goal, proceeds when safe, and reports the decision.

`insane-search` remains an external skill dependency for blocked/WAF-protected access and supported platforms. `choco-pi` references it by policy instead of reimplementing it.

## Development checks

Run the full gate before committing:

```bash
pnpm run check
```

The check runs:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Before a commit, inspect `git status --short --untracked-files=all` and exclude private files, generated artifacts, caches, logs, and unrelated runtime state. Version bumping is autonomous: no bump for tiny docs/comments/tests-only/housekeeping commits, patch for bug fixes or small runtime behavior changes, minor for meaningful new capabilities, and major for breaking behavior/config changes. If a version bump is chosen, keep `package.json` and `extensions/choco-autopilot/version.ts` synchronized.
