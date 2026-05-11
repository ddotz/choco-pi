# ddotz-pi

Personal Pi package for an autonomous PM/development-team workflow.

`ddotz-pi` makes Pi act by default: plan briefly, execute, self-review, fix, verify, and report evidence. It keeps Claude/Codex state isolated, uses Pi-native extensions/skills/prompts, and avoids exposing upstream package names in runtime settings.

## Status

- Current package version: `0.5.3`.
- Implemented work modes: `default`, `web-analysis`, `adoption-analysis`.
- Planned work modes: `coding`, `report`.
- Execution intensity is separate from work mode: `micro`, `standard`, `deep`.

Planned modes are documented but not active. If a user asks to use a planned mode, `ddotz-pi` should ask whether to implement/switch it instead of pretending the mode already exists.

## Fresh environment setup

For a new machine or a clean Pi agent directory, install `ddotz-pi` as a Pi package and then reload or restart Pi.

Git install, after the target revision is pushed:

```bash
pi install git:github.com/ddotz/ddotz-pi
```

Local checkout install for unreleased or local changes:

```bash
git clone https://github.com/ddotz/ddotz-pi.git /absolute/path/to/ddotz-pi
cd /absolute/path/to/ddotz-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/ddotz-pi
```

If Pi is already running, run `/reload-runtime` after installation. Otherwise, start Pi normally; Pi loads installed packages from `~/.pi/agent/settings.json`.

## What gets loaded

`package.json` declares the Pi resources explicitly:

- Extensions
  - `extensions/ddotz-autopilot/index.ts`
  - `extensions/input-newline/index.ts`
  - `extensions/todo-widget.ts`
  - `extensions/ddotz-footer/index.ts`
  - `extensions/fff-search/index.ts`
  - `node_modules/pi-lsp-client/src/index.ts`
  - `extensions/focus-rendering/index.ts`
  - `extensions/raw-paste/index.ts`
  - `extensions/btw.ts`
- Skills: `skills/`
- Prompt templates: `prompts/`

Selected utility behavior is absorbed as local `ddotz-pi` extensions so a new environment only needs this package entry.

## Architecture (English)

### 1. Package boundary and load model

`ddotz-pi` is a Pi package, not a fork of Pi. Pi loads it through the `pi` field in `package.json`, which registers extensions, skills, and prompt templates from this repository. The package keeps runtime behavior local to Pi's extension system and avoids depending on Claude-only runtime state.

```text
Pi runtime
  ├─ package.json pi.extensions[]
  │   ├─ ddotz-autopilot        # PM loop, guards, state, commands, reload tool
  │   ├─ input-newline          # routes extension text prompts through multiline editor
  │   ├─ todo-widget            # session-scoped todo tool/widget
  │   ├─ ddotz-footer           # custom two-line footer
  │   ├─ fff-search             # FFF-backed find/grep and @mention search
  │   ├─ pi-lsp-client          # LSP diagnostics/navigation integration
  │   ├─ focus-rendering        # focused tool-output view
  │   ├─ raw-paste              # bracketed raw paste editor mode
  │   └─ btw                    # Korean-localized side conversation overlay
  ├─ package.json pi.skills[]   # skills/ddotz-autopilot
  └─ package.json pi.prompts[]  # prompts/autopilot.md
```

The core design is layered:

1. **Policy layer**: builds the autonomous PM system prompt, runtime reality-correction rules, and runtime constraints.
2. **Guard layer**: blocks or repairs unsafe/incomplete execution.
3. **State layer**: persists mode, intensity, session effective-mode overlays, memory, session-scoped ledgers, source tracking, and custom mode registry.
4. **UI layer**: footer, todo widget, focus view, raw paste, BTW side conversations, and search/editor affordances.
5. **Verification layer**: tests and quality gates enforce behavior before commits.

### 2. Autopilot extension

`extensions/ddotz-autopilot/index.ts` is the coordination hub. It owns the persistent ddotz state at:

```text
~/.pi/agent/ddotz-pi/state.json
```

State schema version `2` stores:

- `runtime`: active work mode and execution intensity.
- `memories`: durable facts explicitly stored by `/memory`.
- `ledgers`: cwd-keyed compact work ledgers.
- `sourceRegistry`: tracked/adopted external sources and weekly check metadata.
- `workModeRegistry`: built-in and custom planned mode metadata.

The extension hooks into Pi lifecycle events:

- `before_agent_start`: loads state, creates/updates the context ledger, infers planned mode hints, classifies execution intensity, and appends the ddotz autonomous PM prompt.
- `tool_call`: applies approval-boundary guards and records changed files for write/edit calls.
- `tool_result`: records verification command results from bash output.
- `session_start`: checks due tracked GitHub sources and sets the mode/intensity/version status indicator.
- `session_shutdown`: removes the mode status indicator.

It also registers user commands:

- `/mode`: status/list/set/add/remove work modes.
- `/intensity`: status/set execution intensity.
- `/source`: track, watch, adopt/reject, and check external sources.
- `/memory`: list/save durable memory.
- `/ledger`: show/reset the context ledger.
- `/reload-runtime`: reload extensions/skills/prompts/themes without starting a new session.

### 3. Hooks

`ddotz-pi` uses Pi hooks as runtime interception points rather than shell wrappers or external daemons.

| Hook | Owner | Purpose |
| --- | --- | --- |
| `before_agent_start` | `ddotz-autopilot` | Inject autonomous PM policy, current mode/intensity, ledger summary, and source-tracking context. |
| `tool_call` | `ddotz-autopilot` | Guard dangerous tool calls before execution; record edit/write paths for the ledger. |
| `tool_result` | `ddotz-autopilot` | Capture verification commands and pass/fail evidence into the ledger. |
| `message_end` | `structural-gate` | Fail closed if a non-trivial turn tries to finish without passing the structural gate. |
| `session_start` | multiple extensions | Rehydrate state, install UI widgets/footer/editor components, clear current-session todos on `/new`, and update runtime status. |
| `session_shutdown` | multiple extensions | Dispose UI/status/editor patches and clear per-session references. |
| `agent_start` | `focus-rendering` | Keep Pi's built-in working indicator hidden while the focused tool view is active. |
| `resources_discover` | Pi package loader | Pi discovers package skills/prompts/themes from `package.json`; runtime reload re-runs discovery. |

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

#### Structural gate guard

`structural-gate.ts` registers two tools:

- `loop_transition`: records that a plan/todo boundary was crossed deliberately.
- `structural_gate`: records the final acceptance/runtime/failure/verification/loop/completion review.

For non-trivial turns, the `message_end` hook checks whether the gate passed. If it did not pass, the final assistant message is replaced with a short visible status message and a hidden repair follow-up is queued. Medium confidence is treated as not complete.

#### Loop-governance guard

The structural gate tracks completed todo steps and loop transitions. If a todo is marked done but no `loop_transition` is recorded before crossing to the next step or final answer, the gate fails. If new work appears after a completed todo, the gate requires explicit handling: deferred, new steering, new loop, or approval boundary.

#### Completion-boundary guard

`completion-boundary.ts` distinguishes required in-scope work from optional or new-scope follow-ups. Autonomous execution continues only for unmet requested outcomes, failed verification, or critical in-scope issues; it stops at approval boundaries and does not silently expand scope.

#### Commit-hygiene and version-sync guards

`commit-hygiene.ts` classifies paths before commits and excludes secrets, private files, generated artifacts, caches, logs, Superpowers runtime artifacts, and unneeded dotfiles. `scripts/check-version-sync.ts` keeps `package.json` and `extensions/ddotz-autopilot/version.ts` synchronized when a version bump is chosen.

### 5. Work modes and execution intensity

Work mode and intensity are intentionally separate.

- **Work mode** is a policy overlay. `default`, `web-analysis`, and `adoption-analysis` are implemented; other built-in modes remain planned.
- **Execution intensity** controls process weight: `micro`, `standard`, or `deep`.

Mode files live under:

```text
modes/_base/MODE.md
modes/default/MODE.md
modes/<planned-mode>/MODE.md
```

Custom modes created with `/mode add` are stored under:

```text
~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md
```

Planned modes can be listed and registered, but they are not activated unless implementation is added later.

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

### 7. Dogfooding quality system

`ddotz-pi` records privacy-preserving cross-project quality cases under `~/.pi/agent/ddotz-pi/dogfood/`. It does not store raw prompt text by default. Each case stores a salted prompt hash, safe project label, work mode, task type, tool counts, verification signals, structural gate signals, and a deterministic `clean / assisted / miss / review` outcome.

Use `/dogfood status` to see the current week sample count, `/dogfood weekly` to generate a deterministic weekly report, `/dogfood report` to show the latest report, `/dogfood queue` to inspect ambiguous cases, and `/dogfood explain <id>` to explain a case without raw prompt text.

Auto-improvement requires at least 25 eligible weekly cases and at least 3 repeated assisted/miss cases for the same pattern. The MVP does not run hidden background LLM judging or store raw prompt/tool output.

### 8. Todo subsystem

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

### 9. Footer subsystem

`extensions/ddotz-footer/` replaces Pi's footer with a two-line footer:

```text
<model> | ⎇ <branch> v<version> | <cwd> | ◉ <thinking>
  <mode> | 5h:<usage> wk:<usage> | ctx <percent> | <cost> | tools:<n> | todo <done/total> | <run-state>
```

Data sources:

- model/provider from `ctx.model`,
- branch from Pi footer data, then `git -C <cwd>`, then the ddotz-pi repo fallback,
- version from `package.json`,
- mode from `~/.pi/agent/ddotz-pi/state.json`,
- todo summary from `<cwd>/.pi/sessions/<sessionId>/todos.json`,
- run state from agent/tool lifecycle hooks,
- Codex rate limits from `codex app-server --listen stdio://`,
- Claude usage from existing Claude cache files when the active provider is Anthropic.

The footer caches expensive probes and truncates each line to the terminal width.

### 10. Focus view / focus rendering

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

### 11. Search, paste, and editor helpers

`extensions/fff-search/` replaces built-in `find` and `grep` tools with FFF-backed search and can replace `@`-mention autocomplete in the editor. It stores FFF frecency/history/config under:

```text
~/.pi/agent/fff/
```

`extensions/input-newline/` treats ddotz-pi as one coherent Pi environment by routing extension text prompts through Pi's multiline editor. `Ctrl+J` follows the same newline behavior as the main prompt instead of being interpreted as a single-line submit.

`extensions/raw-paste/` owns the editor component for bracketed paste. `/paste` arms raw paste mode so the next bracketed paste is inserted into the editor as visible text instead of being interpreted as keystroke commands. `/paste cancel` disarms it.

`extensions/btw.ts` owns `/btw` side conversations as a local ddotz-pi feature. It is adapted from `pi-btw` under MIT license, localized for Korean respectful side-session answers, and no longer needs a separate `npm:pi-btw` package entry.

`pi-lsp-client` is loaded as a package dependency and supplies LSP diagnostics/navigation tools.

### 12. Runtime reload

`runtime-reload.ts` provides `/reload-runtime` and the LLM-callable `reload_runtime` tool. Preferred behavior is direct `ctx.reload()`. When direct reload is unavailable from a tool context, it self-submits `/reload-runtime --continue` through tmux and writes a resume marker. After reload, `session_start(reason: "reload")` claims the marker and sends `continue` as a follow-up message.

This keeps extension changes, skills, prompts, and themes reloadable without starting a new conversation session.

### 13. Verification architecture

The default quality gate is:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Tests are organized by subsystem: approval boundary, completion boundary, commit hygiene, context ledger, footer core, extension commands, FFF formatting, focus rendering, memory, package config, policy, raw paste, runtime reload, source registry, structural gate, todo widget, version sync, and work-mode registry.

## 아키텍처 (한국어)

### 1. 패키지 경계와 로드 모델

`ddotz-pi`는 Pi 포크가 아니라 Pi 패키지입니다. Pi는 `package.json`의 `pi` 필드를 읽어 이 저장소의 extension, skill, prompt template을 로드합니다. 런타임 동작은 Pi extension 시스템 안에 두고, Claude 전용 런타임 상태에는 의존하지 않습니다.

```text
Pi runtime
  ├─ package.json pi.extensions[]
  │   ├─ ddotz-autopilot        # PM 루프, guard, 상태, 명령, reload tool
  │   ├─ input-newline          # extension text prompt를 multiline editor로 라우팅
  │   ├─ todo-widget            # 세션 격리 todo tool/widget
  │   ├─ ddotz-footer           # 2줄 footer
  │   ├─ fff-search             # FFF 기반 find/grep 및 @mention 검색
  │   ├─ pi-lsp-client          # LSP diagnostics/navigation
  │   ├─ focus-rendering        # focused tool-output view
  │   ├─ raw-paste              # bracketed raw paste editor mode
  │   └─ btw                    # Korean-localized side conversation overlay
  ├─ package.json pi.skills[]   # skills/ddotz-autopilot
  └─ package.json pi.prompts[]  # prompts/autopilot.md
```

계층 구조는 다음과 같습니다.

1. **Policy layer**: autonomous PM system prompt와 런타임 제약을 생성합니다.
2. **Guard layer**: 위험하거나 불완전한 실행을 차단하거나 복구합니다.
3. **State layer**: mode, intensity, session effective-mode overlay, memory, session-scoped ledger, source tracking, custom mode registry를 저장합니다.
4. **UI layer**: footer, todo widget, focus view, raw paste, BTW side conversation, search/editor 편의 기능을 제공합니다.
5. **Verification layer**: 테스트와 품질 게이트로 커밋 전 동작을 검증합니다.

### 2. Autopilot extension

`extensions/ddotz-autopilot/index.ts`가 전체 조정 허브입니다. ddotz 상태는 아래 파일에 저장됩니다.

```text
~/.pi/agent/ddotz-pi/state.json
```

state schema version `2`는 다음을 저장합니다.

- `runtime`: 현재 work mode와 execution intensity.
- `memories`: `/memory`로 명시 저장한 durable fact.
- `ledgers`: cwd별 compact work ledger.
- `sourceRegistry`: 추적/채택한 외부 source와 주간 체크 메타데이터.
- `workModeRegistry`: built-in/custom planned mode 메타데이터.

주요 Pi hook 연결은 다음과 같습니다.

- `before_agent_start`: state를 읽고, context ledger를 생성/갱신하고, planned mode hint와 execution intensity를 계산한 뒤 autonomous PM prompt를 추가합니다.
- `tool_call`: approval-boundary guard를 적용하고 write/edit 경로를 ledger에 기록합니다.
- `tool_result`: bash 검증 명령 결과를 ledger에 기록합니다.
- `session_start`: due 상태인 GitHub source를 체크하고 mode/intensity/version status를 설정합니다.
- `session_shutdown`: status indicator를 제거합니다.

등록 명령은 `/mode`, `/intensity`, `/source`, `/memory`, `/ledger`, `/reload-runtime`입니다.

### 3. Hook 구조

`ddotz-pi`는 shell wrapper나 외부 daemon 대신 Pi hook을 런타임 interception point로 사용합니다.

| Hook | 담당 | 역할 |
| --- | --- | --- |
| `before_agent_start` | `ddotz-autopilot` | autonomous PM policy, 현재 mode/intensity, ledger summary, source-tracking context 주입. |
| `tool_call` | `ddotz-autopilot` | tool 실행 전 위험 호출 차단, edit/write 경로 ledger 기록. |
| `tool_result` | `ddotz-autopilot` | 검증 명령과 pass/fail evidence를 ledger에 기록. |
| `message_end` | `structural-gate` | non-trivial turn이 structural gate 없이 끝나면 fail-closed 처리. |
| `session_start` | 여러 extension | state 복원, UI widget/footer/editor 설치, `/new` current-session todo clear, runtime status 갱신. |
| `session_shutdown` | 여러 extension | UI/status/editor reference 정리. |
| `agent_start` | `focus-rendering` | focused view 활성 시 Pi 기본 working indicator 숨김. |
| `resources_discover` | Pi package loader | `package.json`의 skills/prompts/themes 재발견; runtime reload 때 다시 실행. |

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

#### Structural gate guard

`structural-gate.ts`는 두 tool을 등록합니다.

- `loop_transition`: plan/todo step boundary를 의도적으로 넘었다는 기록.
- `structural_gate`: 최종 acceptance/runtime/failure/verification/loop/completion review 기록.

non-trivial turn에서 gate가 통과되지 않으면 `message_end` hook이 최종 assistant message를 짧은 표시용 상태 메시지로 교체하고 hidden repair follow-up을 큐에 넣습니다. `Medium` confidence는 완료 상태가 아닙니다.

#### Loop-governance guard

Structural gate는 todo 완료와 loop transition 수를 추적합니다. todo를 `done`으로 바꾼 뒤 다음 step이나 final로 넘어가기 전에 `loop_transition`이 없으면 gate가 실패합니다. 완료된 todo 이후 새 작업이 생기면 deferred, new steering, new loop, approval boundary 중 하나로 명시 처리해야 합니다.

#### Completion-boundary guard

`completion-boundary.ts`는 in-scope required work와 optional/new-scope follow-up을 구분합니다. 요청 결과 미충족, 검증 실패, 현재 작업이 만든 critical issue가 있을 때만 계속 진행하고, approval boundary에서는 멈춥니다.

#### Commit-hygiene / version-sync guard

`commit-hygiene.ts`는 커밋 전 path risk를 분류합니다. secret/private file, generated artifact, cache, log, Superpowers runtime artifact, 불필요한 dotfile은 제외합니다. `scripts/check-version-sync.ts`는 버전 bump 시 `package.json`과 `extensions/ddotz-autopilot/version.ts`를 동기화합니다.

### 5. Work mode와 execution intensity

Work mode와 execution intensity는 분리되어 있습니다.

- **Work mode**: policy overlay입니다. 현재 구현된 mode는 `default`, `web-analysis`, `adoption-analysis`이고 나머지 built-in mode는 planned 상태입니다.
- **Execution intensity**: 처리 강도입니다. `micro`, `standard`, `deep` 중 하나입니다.

mode file 위치는 다음입니다.

```text
modes/_base/MODE.md
modes/default/MODE.md
modes/<planned-mode>/MODE.md
```

`/mode add`로 만든 custom mode는 아래에 저장됩니다.

```text
~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md
```

planned mode는 등록/표시는 가능하지만, 구현 전에는 활성화하지 않습니다.

### 6. Context ledger, memory, source registry

Context ledger는 cwd별 compact workspace state입니다. 기록 항목은 objective, assumptions, decisions, changed files, verification commands/status, blockers, risks, next actions입니다.

ledger는 hook에서 자동 갱신됩니다. write/edit tool call은 changed file을 추가하고, 검증성 bash command는 pass/fail evidence를 추가합니다. `/ledger reset`은 현재 cwd ledger를 초기화합니다.

Memory는 명시적으로 저장하는 durable state입니다. `/memory save`는 장기적으로 유효한 사실만 저장하는 용도입니다.

Source registry는 실제로 채택했거나 사용자가 명시적으로 추적 요청한 외부 source만 기록합니다. 신규 Pi 기능 요청은 먼저 https://pi.dev/packages 에서 유사 패키지를 확인하고, 높은 유사도의 패키지가 있으면 source/license/security를 검토한 뒤 fork/clone 기반으로 커스터마이징합니다. GitHub source는 주 1회 `git ls-remote`로 확인하고, 변경된 source는 autopilot prompt에 포함되어 adopt / partially adopt / reject 판단을 유도합니다.

### 7. Dogfooding quality system

`ddotz-pi`는 cross-project 품질 case를 `~/.pi/agent/ddotz-pi/dogfood/` 아래에 privacy-preserving 형태로 기록합니다. 기본적으로 raw prompt text는 저장하지 않습니다. 각 case는 salted prompt hash, 안전한 project label, work mode, task type, tool count, verification signal, structural gate signal, deterministic `clean / assisted / miss / review` outcome을 저장합니다.

`/dogfood status`는 현재 주 sample count를 보여주고, `/dogfood weekly`는 deterministic weekly report를 생성하며, `/dogfood report`는 최신 report를 표시합니다. `/dogfood queue`는 애매한 case 수를 보여주고, `/dogfood explain <id>`는 raw prompt text 없이 case 판정 이유를 설명합니다.

자동 개선은 주간 eligible case 25개 이상, 같은 assisted/miss pattern 3회 이상일 때만 허용됩니다. MVP는 hidden background LLM judging을 실행하지 않고 raw prompt/tool output도 저장하지 않습니다.

### 8. Todo subsystem

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

### 9. Footer subsystem

`extensions/ddotz-footer/`는 Pi footer를 2줄 footer로 교체합니다.

```text
<model> | ⎇ <branch> v<version> | <cwd> | ◉ <thinking>
  <mode> | 5h:<usage> wk:<usage> | ctx <percent> | <cost> | tools:<n> | todo <done/total> | <run-state>
```

데이터 source는 다음입니다.

- `ctx.model`의 model/provider,
- Pi footer branch data → `git -C <cwd>` → ddotz-pi repo branch fallback,
- `package.json` version,
- `~/.pi/agent/ddotz-pi/state.json` mode,
- `<cwd>/.pi/sessions/<sessionId>/todos.json` todo summary,
- agent/tool lifecycle hook 기반 run state,
- `codex app-server --listen stdio://` 기반 Codex rate limit,
- Anthropic provider일 때 Claude cache 기반 usage.

비싼 probe는 cache하고, 각 line은 terminal width에 맞춰 truncate합니다.

### 10. Focus view / focus rendering

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

### 11. Search, paste, editor helper

`extensions/fff-search/`는 built-in `find`/`grep`을 FFF 기반으로 대체하고 editor `@`-mention autocomplete도 대체할 수 있습니다. FFF frecency/history/config는 아래에 저장됩니다.

```text
~/.pi/agent/fff/
```

`extensions/input-newline/`은 ddotz-pi를 하나의 Pi 환경으로 다루기 위해 extension text prompt를 Pi multiline editor로 라우팅합니다. 그래서 `Ctrl+J`가 단일행 submit으로 해석되지 않고 main prompt와 같은 newline 동작을 따릅니다.

`extensions/raw-paste/`는 bracketed paste용 editor component를 소유합니다. `/paste`는 다음 bracketed paste를 arm해서 keystroke command가 아니라 editor text로 삽입하게 하고, `/paste cancel`은 해제합니다.

`extensions/btw.ts`는 `/btw` side conversation을 ddotz-pi 로컬 기능으로 소유합니다. MIT 라이선스의 `pi-btw`에서 흡수하되 한국어 존댓말 side-session 답변에 맞게 로컬라이즈했으며, 별도 `npm:pi-btw` package entry는 필요하지 않습니다.

`pi-lsp-client`는 package dependency로 로드되어 LSP diagnostics/navigation tool을 제공합니다.

### 12. Runtime reload

`runtime-reload.ts`는 `/reload-runtime`과 LLM-callable `reload_runtime` tool을 제공합니다. 가능한 경우 `ctx.reload()`를 직접 호출합니다. tool context에서 직접 reload가 어려우면 tmux로 `/reload-runtime --continue`를 self-submit하고 resume marker를 씁니다. reload 이후 `session_start(reason: "reload")`가 marker를 claim하고 `continue` follow-up message를 보냅니다.

이 구조 덕분에 새 conversation session을 만들지 않고 extension, skill, prompt, theme 변경을 반영할 수 있습니다.

### 13. Verification architecture

기본 품질 게이트는 다음입니다.

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

테스트는 subsystem별로 나뉩니다. approval boundary, completion boundary, commit hygiene, context ledger, footer core, extension commands, FFF formatting, focus rendering, memory, package config, policy, raw paste, runtime reload, source registry, structural gate, todo widget, version sync, work-mode registry를 검증합니다.

## Commands

- `/mode` — open the interactive work-mode selector with each mode description.
- `/mode [status|list|set <mode>|add <id> <description>|remove <id>]` — manage work modes. `default`, `web-analysis`, and `adoption-analysis` are implemented modes.
- `/intensity [micro|standard|deep|status]` — show or set process weight.
- `/source [list|add|watch|adopt|reject|due|changed|check]` — track adopted, watched, or explicitly tracked external sources.
- `/btw`, `/btw:new`, `/btw:tangent`, `/btw:inject`, `/btw:summarize`, `/btw:clear`, `/btw:model`, `/btw:thinking` — run Korean-localized side conversations in a focused overlay without installing `npm:pi-btw` separately.
- `/memory [list|save <text>]` — list/save durable memories.
- `/ledger [reset]` — show/reset the compact workspace Context Ledger.
- `/reload-runtime` — reload extensions, skills, prompts, and themes without starting a new session. The LLM-callable `reload_runtime` tool self-submits `/reload-runtime --continue` through tmux when direct tool reload is unavailable, waits for the command acknowledgement marker, then the reloaded extension sends `continue` from `session_start(reason: "reload")`.

## Mode folder structure

```text
modes/
  _base/MODE.md                # shared autonomous PM philosophy
  default/MODE.md              # base implemented mode
  coding/MODE.md               # planned coding overlay
  report/MODE.md               # planned report-writing overlay
  web-analysis/MODE.md         # implemented web research overlay
  adoption-analysis/MODE.md    # implemented source adoption overlay
```

Custom modes use the same shape: `modes/<mode-id>/MODE.md`. Runtime-created custom modes are stored under `~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md` and registered by `/mode add`.

## Runtime behavior

- Ask only for hard approval boundaries: production deployment/package publishing, payment, secrets/accounts, large deletion, external private-data transfer, irreversible actions, work mode switching, or contradictory goals without safe defaults.
- For new Pi feature/capability requests, check https://pi.dev/packages before building from scratch. If a high-similarity package exists, inspect source/license/security, fork or clone it as the baseline, and customize it to the user's final requirements.
- Mode isolation is mandatory for every work mode, including future planned and custom modes.
- New mode policies, skills, plugin/extension guidance, processes, priorities, tools, and guardrails must apply only while that mode is active.
- No mode may change default or any other mode as a side effect; shared changes belong in `modes/_base/MODE.md` only when they are mode-agnostic.
- In `default`, autopilot may apply an implemented mode as a temporary session-scoped effective overlay for the current turn without persistently changing `/mode`.
- Prefer isolated git worktrees for parallel/multi-session work. Todo and ledger state are session-scoped by default; use project-shared todos only when explicitly needed.
- `web-analysis` retrieval/review policy and message-end quality guardrail are active only while that mode is active.
- `adoption-analysis` does not replace default adoption capability; it adds mode-scoped decision, adoption-depth, fit/risk, scope, tracking, and confidence quality guardrails only while active.
- The `source_registry` tool is the Pi-native LLM path for autonomous source tracking; use `watch` when a source is relevant but not safe or ready to adopt.
- Commit and push autonomously after verification when the working tree contains intentional in-scope changes and a remote is configured; normal `git push` is routine source synchronization, not deployment.
- Treat each plan/todo step as a bounded loop. Complete a step, verify fit, record `loop_transition`, then move on.
- If new work appears after the current todo, start a new loop or defer it explicitly. Do not silently append scope.
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
- Footer shows `⎇ <branch> v<version>`, and line 2 starts with the current mode and ends with Codex-style run state (`Ready`, `Starting`, `Thinking`, `Working`) after the todo count.
- Footer usage values (`5h`, `wk`, `ctx`) highlight only numeric values in cyan.
- Confidence labels are `High`, `Medium`, and `Low`; terminal/UI rendering should use white text on green/yellow/red backgrounds.
- Final Markdown should use plain labels such as `Confidence: High`, not HTML badges.

## External source policy

Do not track links for simple analysis. Track only when:

- the source was actually reflected into `ddotz-pi`, or
- the user explicitly asks to track it.

Tracked/adopted sources are checked weekly. If upstream changed, the agent analyzes fit, decides adopt / partially adopt / reject against the autonomous PM/development goal, proceeds when safe, and reports the decision.

`insane-search` remains an external skill dependency for blocked/WAF-protected access and supported platforms. `ddotz-pi` references it by policy instead of reimplementing it.

## Development checks

Run the full gate before committing:

```bash
pnpm run check
```

The check runs:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Before a commit, inspect `git status --short --untracked-files=all` and exclude private files, generated artifacts, caches, logs, and unrelated runtime state. Version bumping is autonomous: no bump for tiny docs/comments/tests-only/housekeeping commits, patch for bug fixes or small runtime behavior changes, minor for meaningful new capabilities, and major for breaking behavior/config changes. If a version bump is chosen, keep `package.json` and `extensions/ddotz-autopilot/version.ts` synchronized.
