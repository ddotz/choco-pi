# choco-pi

![choco-pi hero](assets/choco-pi-hero.png)

**choco-pi** is a private Pi package. Its implemented surface is a set of Pi extensions, two skills, prompt templates, work-mode policy files, runtime state, and tests for those pieces.

[한국어 README](README_ko.md)

## Status

- Current package version: `0.13.0`.
- License field: `UNLICENSED`.
- Package manager: `pnpm@10.29.3`.
- Main peer runtime: `@earendil-works/pi-coding-agent`.
- Implemented built-in work modes: `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, `design`.
- Execution intensity values in code: `micro`, `standard`, `deep`.
- Default verification script: `pnpm run check`.

## Package Manifest

Pi loads this repository through the `pi` field in `package.json`.

| Surface | Implemented entries |
| --- | --- |
| Extensions | `extensions/choco-autopilot/index.ts`, `extensions/input-newline/index.ts`, `extensions/todo-widget.ts`, `extensions/choco-footer/index.ts`, `extensions/choco-header/index.ts`, `extensions/fff-search/index.ts`, `node_modules/pi-lsp-client/src/index.ts`, `extensions/focus-rendering/index.ts`, `extensions/raw-paste/index.ts`, `extensions/btw.ts` |
| Skills | `skills/choco-autopilot`, `skills/prd-architect` |
| Prompts | `prompts/` |

This README describes only behavior represented by those files and the current tests.

## Fresh environment setup

Install the GitHub package after the target revision is available:

```bash
pi install git:github.com/ddotz/choco-pi
```

Install a local checkout:

```bash
git clone https://github.com/ddotz/choco-pi.git /absolute/path/to/choco-pi
cd /absolute/path/to/choco-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/choco-pi
```

Reload a running Pi session after installation:

```text
/reload-runtime
```

## Implemented Policy Text

The active policy prompt and mode files also document these implemented instruction surfaces:

- User-facing responses are Korean by default unless the user requests another language.
- The required style is respectful Korean.
- Do not use praise or validation openers.
- Do not end replies with suggestion-led opt-in phrasing.
- For new Pi feature/capability work, the policy instructs agents to check `https://pi.dev/packages` before building from scratch and to inspect any high-similarity package before reuse.
- Mode isolation is mandatory for every work mode.
- No mode may change default or any other mode as a side effect.

## Implemented Skill Routing

`skills/prd-architect/SKILL.md` is exposed through `package.json` and the autopilot skill/prompt document its routing:

- PRD Architect does not replace brainstorming.
- fuzzy idea: run exploration/brainstorming first, then PRD.
- clear direction: use `prd-architect` directly.
- existing PRD: use `prd-architect` directly for critique, gap analysis, and strengthening.

## Runtime State

`extensions/choco-autopilot/index.ts` reads and writes the main state file at:

```text
~/.pi/agent/choco-pi/state.json
```

The current state schema version is `4`. The state object contains:

- `runtime`: persistent work mode and execution intensity.
- `sessions`: per-session effective work mode, suggested mode, automatic-mode flag, execution intensity, and timestamp.
- `memories`: durable facts saved through `/memory`.
- `ledgers`: cwd/session keyed context ledgers.
- `sourceRegistry`: external source tracking records.
- `workModeRegistry`: built-in and custom work-mode metadata.
- `autoUpdate`: choco-pi auto-update settings and last result.

The context ledger schema has fields for objective, assumptions, decisions, changed files, verifications, blockers, risks, and next actions. The implemented automatic updates currently record write/edit file paths and verification-like `bash` command results.

## Implemented Extensions

### `choco-autopilot`

`extensions/choco-autopilot/index.ts` is the main runtime extension. It installs structural and dynamic-SDD tools, source tracking, parallel work planning, runtime reload support, work-mode commands, memory/ledger commands, dogfood commands, and update commands.

Registered hooks in this extension include:

| Hook | Implemented behavior |
| --- | --- |
| `resources_discover` | Attempts to discover Superpowers, Kami, and im-not-ai skill paths. |
| `tool_call` | Blocks approval-boundary tool calls, records dogfood tool calls, and records write/edit paths in the ledger. |
| `tool_result` | Records dogfood tool results and records verification-like `bash` results in the ledger. |
| `session_start` | Cleans dogfood retention, checks up to five due GitHub sources, runs startup auto-update when due, and sets a UI mode status when UI exists. |
| `session_shutdown` | Clears per-session repair state and removes the UI mode status. |
| `before_agent_start` | Resolves effective work mode/intensity, starts dogfood case tracking when eligible, saves session runtime state, and appends the choco-pi policy prompt. |
| `message_end` | Finishes dogfood cases and runs mode-scoped quality guards for web-analysis, coding, adoption-analysis, report, and design modes. |

### `todo-widget`

`extensions/todo-widget.ts` registers the `todo` tool and `/todos` command.

Implemented tool actions are `list`, `add`, `set_status`, `update`, `remove`, and `clear`. Default storage is session-scoped:

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

Project-shared storage is available when the tool uses `scope: "project"`:

```text
<cwd>/.pi/todos.json
```

The implementation validates schema on load, uses atomic temp-file rename for writes, serializes writes with path-level async locks, and protects active todos from accidental remove/clear unless `force=true` is supplied.

### `choco-footer`

`extensions/choco-footer/` installs a custom footer and tracks run state transitions from Pi events such as `session_start`, `before_agent_start`, `agent_start`, `turn_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`, and `session_shutdown`.

The footer formatting code supports model label, project branch/version, cwd, thinking level, mode label, rate-limit text, context text, cost text, tool count, todo label, and run state label.

### `choco-header`

`extensions/choco-header/` installs a custom startup header with a height-matched compact text `CHOCO - PI` block logo, a spaced same-size 3-cell block hyphen, the provided SVG-derived block `pi` mark, and a boxed info panel containing `Choco-Pi v...`, the active model with thinking effort, `/model` and `/effort` command hints, and the current working directory.

### `fff-search`

`extensions/fff-search/index.ts` registers FFF-backed replacements or helpers:

- `grep`
- `find`
- `multi_grep`

It also registers `/fff-mode`, `/fff-health`, and `/fff-rescan`. The implementation uses the native FFF engine when available and includes fallback behavior for `find` and `grep`.

### `focus-rendering`

`extensions/focus-rendering/index.ts` patches Pi tool rendering at runtime to provide compact focused tool-output behavior. It installs on `session_start`, hides Pi's built-in working indicator during `agent_start`, and restores state on `session_shutdown`.

### `raw-paste`

`extensions/raw-paste/index.ts` installs an editor component on `session_start`, restores it on `session_shutdown`, and registers `/paste` for bracketed raw paste mode.

### `input-newline`

`extensions/input-newline/index.ts` patches extension text prompts during `session_start` so extension input can use the multiline editor behavior.

### `btw`

`extensions/btw.ts` implements a Korean-localized side conversation overlay and registers:

- `/btw`
- `/btw:tangent`
- `/btw:new`
- `/btw:clear`
- `/btw:inject`
- `/btw:summarize`
- `/btw:model`
- `/btw:thinking`

### `pi-lsp-client`

`package.json` loads `node_modules/pi-lsp-client/src/index.ts` as an extension dependency.

## Implemented Tools

| Tool | Implemented in | Purpose |
| --- | --- | --- |
| `spec_gate` | `dynamic-sdd.ts` | Start/list/clear a turn-local Working Spec, record Spec Deltas, and take snapshots. |
| `loop_transition` | `structural-gate.ts` | Record deliberate plan/todo boundary transitions. |
| `structural_gate` | `structural-gate.ts` | Record final acceptance/runtime/failure/verification/loop/completion review. |
| `source_registry` | `index.ts` | List/add/watch/adopt/reject/due/changed/check external sources. |
| `parallel_work_plan` | `parallel-work-plan-tool.ts` | Produce a collision-avoidance plan for parallel work. |
| `reload_runtime` | `runtime-reload.ts` | Reload Pi runtime resources directly or through tmux self-input fallback. |
| `todo` | `todo-widget.ts` | Manage session or project todo files. |
| `grep`, `find`, `multi_grep` | `fff-search/index.ts` | Search files/content through FFF-backed tools. |

## Work Modes

The built-in work modes are defined in `extensions/choco-autopilot/mode.ts` and described in `modes/`.

| Mode | Implemented description |
| --- | --- |
| `default` | Root all-purpose policy baseline. It can apply implemented specialized modes as temporary session-scoped overlays. |
| `coding` | TDD-first implementation/debugging/refactoring policy with coding quality guard. |
| `report` | Evidence-led report policy with report quality guard. |
| `design` | Product/UI design policy with design quality guard. |
| `web-analysis` | Retrieval-first external research policy with web research quality guard. |
| `adoption-analysis` | External source/package/repo adoption review policy with adoption quality guard. |

`/mode add` registers custom modes as `planned`; built-in code does not make arbitrary custom modes executable work modes.

## Commands

| Command | Registered behavior |
| --- | --- |
| `/mode` | Open selector or manage modes with `status`, `list`, `set`, `add`, `remove`. |
| `/intensity` | Show or set `micro`, `standard`, or `deep`. |
| `/effort` | Show or set supported model effort levels. |
| `/source` | Manage source registry with `list`, `add`, `watch`, `adopt`, `reject`, `due`, `changed`, `check`. |
| `/memory` | List memories or save a durable memory candidate. |
| `/ledger` | Show the current cwd/session ledger or reset it. |
| `/dogfood` | Show dogfood status, weekly report, latest report, queue length, or case explanation. |
| `/update` | Run Pi update flows or choco-pi self-update and manage auto-update status. |
| `/reload-runtime` | Reload extensions, skills, prompts, and themes. |
| `/todos` | Open the current session todo UI. |
| `/paste` | Arm or cancel raw paste mode. |
| `/btw*` | Manage BTW side conversations. |
| `/fff-*` | Manage FFF search mode, health, and rescan. |

## Source Tracking

Source tracking is implemented in `source-registry.ts` and exposed by both `/source` and `source_registry`.

Implemented source kinds:

- `github`
- `url`

Implemented statuses:

- `candidate`
- `watching`
- `adopted`
- `rejected`

GitHub checks use `git ls-remote <repo> HEAD`. Non-GitHub URLs return a message that model-led analysis is required. `session_start` checks up to five due GitHub sources and updates stored check metadata.

## Dogfood Data

Dogfood case capture is controlled by `CHOCO_PI_IMPROVEMENT_MODE` and `CHOCO_PI_IMPROVEMENT_PROFILE`. When capture is enabled for the current scope, cases are stored under:

```text
~/.pi/agent/choco-pi/dogfood/
```

The implemented collector stores salted prompt hashes, scope metadata, work mode, intensity, sanitized flow signals, tool counts, verification signals, structural gate signals, and deterministic outcome fields. It does not store raw prompt text in the case record.

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

`scripts/check-version-sync.ts` verifies that the package version, plugin version constant, and README current-version line stay synchronized when the version changes.

## Repository Map

```text
extensions/choco-autopilot/   # main policy/state/guard/update/source/dogfood extension
extensions/choco-footer/      # footer formatting and runtime hooks
extensions/fff-search/        # FFF-backed find/grep/multi_grep
extensions/focus-rendering/   # focused tool-output rendering patch
extensions/input-newline/     # multiline extension prompt behavior
extensions/raw-paste/         # raw paste editor mode
extensions/btw.ts             # Korean side conversation overlay
modes/                        # built-in mode policy files
skills/                       # choco-autopilot and prd-architect skills
prompts/                      # prompt templates
tests/                        # subsystem tests
scripts/check-version-sync.ts # version consistency check
```
