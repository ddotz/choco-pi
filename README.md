# choco-pi

![choco-pi hero](assets/choco-pi-hero.png)

**choco-pi** is a private Pi package that turns the Pi coding agent into a more opinionated local work environment. It installs runtime extensions, two skills, prompt templates, work-mode policies, persistent state, and tests for those pieces.

[한국어 README](README_ko.md)

This README describes implemented behavior only. It is based on `package.json`, the extension code, and the current tests.

## Status

- Current package version: `0.14.9`.
- License field: `UNLICENSED`.
- Package manager: `pnpm@10.29.3`.
- Main peer runtime: `@earendil-works/pi-coding-agent`.
- Default verification script: `pnpm run check`.

## What choco-pi adds

choco-pi is not a standalone app. Pi loads it through the `pi` field in `package.json`.

| Surface | Loaded entries |
| --- | --- |
| Extensions | `extensions/choco-autopilot/index.ts`, `extensions/input-newline/index.ts`, `extensions/todo-widget.ts`, `extensions/choco-footer/index.ts`, `extensions/choco-header/index.ts`, `extensions/fff-search/index.ts`, `node_modules/pi-lsp-client/src/index.ts`, `extensions/focus-rendering/index.ts`, `extensions/raw-paste/index.ts`, `extensions/btw.ts` |
| Skills | `skills/choco-autopilot`, `skills/prd-architect` |
| Prompts | `prompts/` |

At runtime, those entries provide:

- an autopilot policy layer for planning, execution, verification, memory, ledgers, source tracking, reloads, updates, and quality gates;
- a session/project todo tool and `/todos` UI;
- custom header and footer rendering;
- FFF-backed `grep`, `find`, and `multi_grep` tools;
- compact focused tool-output rendering;
- raw paste and multiline extension input behavior;
- a Korean-localized `/btw` side-conversation overlay;
- an LSP client extension loaded from `pi-lsp-client`.

## Fresh environment setup

Install the GitHub package after the target revision has been pushed:

```bash
pi install git:github.com/ddotz/choco-pi
```

Install from a local checkout:

```bash
git clone https://github.com/ddotz/choco-pi.git /absolute/path/to/choco-pi
cd /absolute/path/to/choco-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/choco-pi
```

Reload an already running Pi session after installation:

```text
/reload-runtime
```

## Runtime behavior

### Autopilot policy

`extensions/choco-autopilot/index.ts` is the main extension. It appends the choco-pi policy prompt during agent startup and installs tools/commands for structural review, dynamic SDD, source tracking, parallel-work planning, runtime reloads, memory, ledgers, dogfood capture, updates, and work-mode control.

The implemented policy includes these defaults:

- User-facing replies are Korean by default unless the user asks for another language.
- Replies should use respectful Korean.
- Do not use praise or validation openers.
- Do not end replies with suggestion-led opt-in phrasing.
- New Pi feature work should check `https://pi.dev/packages` before building from scratch. If a high-similarity package exists, inspect its source, license, and security before reuse.
- Mode isolation is mandatory for every work mode.
- No mode may change default or any other mode as a side effect.
- Completion claims require observable verification and a structural review when work is non-trivial.

### Work modes and intensity

Built-in work modes are defined in `extensions/choco-autopilot/mode.ts` and documented in `modes/`.

| Mode | Purpose |
| --- | --- |
| `default` | Root all-purpose policy baseline. It can apply specialized modes as temporary session-scoped overlays. |
| `coding` | TDD-first implementation, debugging, refactoring, and coding quality guard. |
| `report` | Evidence-led report writing with report quality guard. |
| `design` | Product/UI design work with design quality guard. |
| `web-analysis` | Retrieval-first external research with web research quality guard. |
| `adoption-analysis` | External source/package/repo adoption review with adoption quality guard. |

Execution intensity is a process-weight setting. The implemented values are `micro`, `standard`, and `deep`.

`/mode add` registers custom modes as `planned`. The built-in code does not make arbitrary custom modes executable work modes.

### Skills

`skills/choco-autopilot` documents the autonomous execution flow used by the main prompt and extension.

`skills/prd-architect` handles PRD, product-requirements, and planning-document work. PRD Architect does not replace brainstorming. Its routing is:

- fuzzy idea: explore or brainstorm first, then converge into a PRD;
- clear direction: use `prd-architect` directly;
- existing PRD: use `prd-architect` directly for critique, gap analysis, or strengthening.

## Tools and commands

### Tools

| Tool | Implemented in | Purpose |
| --- | --- | --- |
| `spec_gate` | `dynamic-sdd.ts` | Start/list/clear a turn-local Working Spec, record Spec Deltas, and take snapshots. |
| `loop_transition` | `structural-gate.ts` | Record deliberate plan/todo boundary transitions. |
| `structural_gate` | `structural-gate.ts` | Record final acceptance, runtime, failure-mode, verification, loop, and completion review. |
| `source_registry` | `index.ts` | Manage external sources with list/add/watch/adopt/reject/due/changed/check actions. |
| `branch_switch_guard` | `branch-switch-guard.ts` | Safely switch the current session cwd to a branch after dirty-state and worktree occupancy checks. |
| `parallel_work_plan` | `parallel-work-plan-tool.ts` | Produce a collision-avoidance plan before writable parallel work. |
| `worktree_manage` | `worktree-manage-tool.ts` | Plan, create, list, inspect, hand off, merge-check, and clean-remove isolated git worktrees. |
| `agent_orchestrator` | `agent-orchestrator-tool.ts` | Start, dispatch, update, summarize, and close manifest-backed parallel agent runs. |
| `integration_verifier` | `integration-verifier-tool.ts` | Run final integration verification for manifest-backed parallel lanes before completion. |
| `mode_scaffold` | `mode-scaffold-tool.ts` | Generate planned or implementation-stub files for isolated work modes. |

Runtime lane enforcement also guards active-lane writes and records bash post-diff scope violations; it is installed through the main extension hook rather than exposed as a user-facing tool.
| `reload_runtime` | `runtime-reload.ts` | Reload Pi runtime resources directly or through tmux self-input fallback. |
| `todo` | `todo-widget.ts` | Manage session or project todo files. |
| `grep`, `find`, `multi_grep` | `fff-search/index.ts` | Search files and content through FFF-backed tools. |

### Slash commands

| Command | Behavior |
| --- | --- |
| `/mode` | Open the selector or manage modes with `status`, `list`, `set`, `add`, and `remove`. |
| `/sessions` | Show current session, cwd, branch, todos, manifests, and worktrees. |
| `/intensity` | Show or set `micro`, `standard`, or `deep`. |
| `/effort` | Show or set supported model effort levels. |
| `/source` | Manage source registry records. |
| `/memory` | List memories or save a durable memory candidate. |
| `/ledger` | Show or reset the current cwd/session ledger. |
| `/dogfood` | Show dogfood status, weekly report, latest report, queue length, or case explanation. |
| `/update` | Run Pi update flows, run choco-pi self-update, or manage auto-update status. |
| `/reload-runtime` | Reload extensions, skills, prompts, and themes. |
| `/todos` | Open the current session todo UI. |
| `/paste` | Arm or cancel raw paste mode. |
| `/btw*` | Manage Korean-localized side conversations. |
| `/fff-*` | Manage FFF search mode, health, and rescan. |

## State and data

### Runtime state

The main state file is:

```text
~/.pi/agent/choco-pi/state.json
```

The current state schema version is `4`. The state object stores:

- `runtime`: persistent work mode and execution intensity;
- `sessions`: per-session effective work mode, suggested mode, automatic-mode flag, execution intensity, and timestamp;
- `memories`: durable facts saved through `/memory`;
- `ledgers`: cwd/session keyed context ledgers;
- `sourceRegistry`: external source tracking records;
- `workModeRegistry`: built-in and custom work-mode metadata;
- `autoUpdate`: choco-pi auto-update settings and the last result.

The context ledger tracks objective, assumptions, decisions, changed files, verifications, blockers, risks, and next actions. Automatic ledger updates currently record write/edit paths and verification-like `bash` results.

### Todo storage

The `todo` tool stores todos in the current cwd by default:

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

Project-shared todos use:

```text
<cwd>/.pi/todos.json
```

Todo writes are schema-validated, serialized by path-level async locks, and written with atomic temp-file rename. Active todos are protected from accidental remove/clear unless `force=true` is supplied.

### Source tracking

Source tracking is implemented in `source-registry.ts` and exposed through `/source` and `source_registry`.

- Source kinds: `github`, `url`.
- Statuses: `candidate`, `watching`, `adopted`, `rejected`.
- GitHub checks use `git ls-remote <repo> HEAD`.
- Non-GitHub URL checks return a message that model-led analysis is required.
- `session_start` checks up to five due GitHub sources and updates stored metadata.

### Dogfood data

Dogfood capture is controlled by `CHOCO_PI_IMPROVEMENT_MODE` and `CHOCO_PI_IMPROVEMENT_PROFILE`. When enabled, case records are stored under:

```text
~/.pi/agent/choco-pi/dogfood/
```

The collector stores salted prompt hashes, scope metadata, work mode, intensity, sanitized flow signals, tool counts, verification signals, structural-gate signals, and deterministic outcome fields. It does not store raw prompt text in the case record.

## Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the full project gate:

```bash
pnpm run check
```

`pnpm run check` expands to:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Available scripts:

```bash
pnpm run version:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check
```

`scripts/check-version-sync.ts` verifies that `package.json`, `extensions/choco-autopilot/version.ts`, and the README current-version line stay synchronized.

## Repository map

```text
extensions/choco-autopilot/   # main policy/state/guard/update/source/dogfood extension
extensions/choco-footer/      # footer formatting and runtime hooks
extensions/fff-search/        # FFF-backed find/grep/multi_grep
extensions/focus-rendering/   # focused tool-output rendering patch
extensions/input-newline/     # multiline extension prompt behavior
extensions/raw-paste/         # raw paste editor mode
extensions/btw.ts             # Korean side-conversation overlay
modes/                        # built-in mode policy files
skills/                       # choco-autopilot and prd-architect skills
prompts/                      # prompt templates
tests/                        # subsystem tests
scripts/check-version-sync.ts # version consistency check
```
