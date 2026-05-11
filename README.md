# ddotz-pi

Personal Pi package for an autonomous PM/development-team workflow.

`ddotz-pi` makes Pi act by default: plan briefly, execute, self-review, fix, verify, and report evidence. It keeps Claude/Codex state isolated, uses Pi-native extensions/skills/prompts, and avoids exposing upstream package names in runtime settings.

## Status

- Current package version: `0.1.4`.
- Implemented work mode: `default` only.
- Planned work modes: `coding`, `report`, `web-analysis`, `adoption-analysis`.
- Execution intensity is separate from work mode: `micro`, `standard`, `deep`.

Planned modes are documented but not active. If a user asks to use one, `ddotz-pi` should ask whether to implement/switch it instead of pretending the mode already exists.

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
  - `extensions/todo-widget.ts`
  - `extensions/ddotz-footer/index.ts`
  - `extensions/fff-search/index.ts`
  - `node_modules/pi-lsp-client/src/index.ts`
  - `extensions/focus-rendering/index.ts`
  - `extensions/raw-paste/index.ts`
- Skills: `skills/`
- Prompt templates: `prompts/`

Selected utility behavior is absorbed as local `ddotz-pi` extensions so a new environment only needs this package entry.

## Commands

- `/mode [status|list|set <mode>|add <id> <description>|remove <id>]` — manage work modes. `default` is the only implemented mode.
- `/intensity [micro|standard|deep|status]` — show or set process weight.
- `/source [list|add|adopt|reject|due|changed|check]` — track adopted or explicitly tracked external sources.
- `/memory [list|save <text>]` — list/save durable memories.
- `/ledger [reset]` — show/reset the compact workspace Context Ledger.
- `/reload-runtime` — reload extensions, skills, prompts, and themes without starting a new session. The LLM-callable `reload_runtime` tool self-submits `/reload-runtime --continue` through tmux when direct tool reload is unavailable, waits for the command acknowledgement marker, then the reloaded extension sends `continue` from `session_start(reason: "reload")`.

## Mode folder structure

```text
modes/
  _base/MODE.md                # shared autonomous PM philosophy
  default/MODE.md              # only implemented mode
  coding/MODE.md               # planned coding overlay
  report/MODE.md               # planned report-writing overlay
  web-analysis/MODE.md         # planned web research overlay
  adoption-analysis/MODE.md    # planned source adoption overlay
```

Custom modes use the same shape: `modes/<mode-id>/MODE.md`. Runtime-created custom modes are stored under `~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md` and registered by `/mode add`.

## Runtime behavior

- Ask only for hard approval boundaries: deployment/publishing, payment, secrets/accounts, large deletion, external private-data transfer, irreversible actions, work mode switching, or contradictory goals without safe defaults.
- Treat each plan/todo step as a bounded loop. Complete a step, verify fit, record `loop_transition`, then move on.
- If new work appears after the current todo, start a new loop or defer it explicitly. Do not silently append scope.
- Run the structural gate before final completion on non-trivial work.
- Medium confidence is not a completion state; reinforce verification to `High` or report a concrete blocker.

## Language, UI, and reporting

- User-facing conversation must be in Korean by default unless the user requests another language.
- Use respectful Korean (존댓말) with concise `합니다/습니다` or natural `해요` style; do not use 반말.
- Do not use praise or validation openers such as `좋은 질문이에요`, `맞습니다`, or `완전히 맞습니다`.
- Do not end replies with suggestion-led opt-in phrasing such as `원하면 ~해드릴게요`.
- Todo tool calls render silently while the todo widget updates.
- Read previews stay header-only while collapsed and expand on demand.
- Footer shows `⎇ <branch> v<version>` and the current mode first on line 2.
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

Before a commit, inspect `git status --short --untracked-files=all` and exclude private files, generated artifacts, caches, logs, and unrelated runtime state. If a version bump is chosen, keep `package.json` and `extensions/ddotz-autopilot/version.ts` synchronized.
