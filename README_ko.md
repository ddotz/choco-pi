# choco-pi

![choco-pi hero](assets/choco-pi-hero.png)

**choco-pi**는 private Pi package입니다. 현재 구현된 표면은 Pi extensions, 두 개의 skill, prompt templates, work-mode policy files, runtime state, 그리고 이 구성요소를 검증하는 tests입니다.

[English README](README.md)

## 상태

- 현재 패키지 버전: `0.12.2`.
- license 필드: `UNLICENSED`.
- package manager: `pnpm@10.29.3`.
- 주요 peer runtime: `@earendil-works/pi-coding-agent`.
- 구현된 built-in work mode: `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`, `design`.
- 코드에 정의된 execution intensity: `micro`, `standard`, `deep`.
- 기본 검증 스크립트: `pnpm run check`.

## Package Manifest

Pi는 `package.json`의 `pi` 필드를 통해 이 저장소를 로드합니다.

| 표면 | 구현된 항목 |
| --- | --- |
| Extensions | `extensions/choco-autopilot/index.ts`, `extensions/input-newline/index.ts`, `extensions/todo-widget.ts`, `extensions/choco-footer/index.ts`, `extensions/fff-search/index.ts`, `node_modules/pi-lsp-client/src/index.ts`, `extensions/focus-rendering/index.ts`, `extensions/raw-paste/index.ts`, `extensions/btw.ts` |
| Skills | `skills/choco-autopilot`, `skills/prd-architect` |
| Prompts | `prompts/` |

이 README는 위 파일과 현재 테스트로 확인되는 동작만 설명합니다.

## Fresh environment setup

대상 리비전이 GitHub에 올라간 뒤 설치합니다.

```bash
pi install git:github.com/ddotz/choco-pi
```

로컬 checkout을 설치합니다.

```bash
git clone https://github.com/ddotz/choco-pi.git /absolute/path/to/choco-pi
cd /absolute/path/to/choco-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/choco-pi
```

이미 실행 중인 Pi session에서 다시 로드합니다.

```text
/reload-runtime
```

## 구현된 Policy Text

현재 policy prompt와 mode file에는 다음 instruction surface가 구현되어 있습니다.

- User-facing responses are Korean by default unless the user requests another language.
- The required style is respectful Korean.
- Do not use praise or validation openers.
- Do not end replies with suggestion-led opt-in phrasing.
- 새 Pi feature/capability 작업에서는 처음부터 만들기 전에 `https://pi.dev/packages`를 확인하고, high-similarity package가 있으면 재사용 전에 검토하도록 지시합니다.
- Mode isolation is mandatory for every work mode.
- No mode may change default or any other mode as a side effect.

## 구현된 Skill Routing

`skills/prd-architect/SKILL.md`는 `package.json`을 통해 노출되며, autopilot skill/prompt에는 다음 routing이 문서화되어 있습니다.

- PRD Architect does not replace brainstorming.
- fuzzy idea: exploration/brainstorming을 먼저 수행한 뒤 PRD로 수렴합니다.
- clear direction: `prd-architect`를 바로 사용합니다.
- existing PRD: critique, gap analysis, strengthening에 `prd-architect`를 바로 사용합니다.

## Runtime State

`extensions/choco-autopilot/index.ts`는 아래 main state file을 읽고 씁니다.

```text
~/.pi/agent/choco-pi/state.json
```

현재 state schema version은 `4`입니다. state object는 다음을 포함합니다.

- `runtime`: persistent work mode와 execution intensity.
- `sessions`: session별 effective work mode, suggested mode, automatic-mode flag, execution intensity, timestamp.
- `memories`: `/memory`로 저장한 durable fact.
- `ledgers`: cwd/session key 기반 context ledger.
- `sourceRegistry`: external source tracking record.
- `workModeRegistry`: built-in/custom work-mode metadata.
- `autoUpdate`: choco-pi auto-update 설정과 마지막 결과.

Context ledger schema에는 objective, assumptions, decisions, changed files, verifications, blockers, risks, next actions 필드가 있습니다. 현재 구현된 자동 기록은 write/edit file path와 verification 성격의 `bash` command result 중심입니다.

## 구현된 Extensions

### `choco-autopilot`

`extensions/choco-autopilot/index.ts`는 main runtime extension입니다. structural/dynamic-SDD tools, source tracking, parallel work planning, runtime reload, work-mode commands, memory/ledger commands, dogfood commands, update commands를 설치합니다.

이 extension이 등록하는 hook은 다음입니다.

| Hook | 구현된 동작 |
| --- | --- |
| `resources_discover` | Superpowers, Kami, im-not-ai skill path 발견을 시도합니다. |
| `tool_call` | approval-boundary tool call을 차단하고, dogfood tool call을 기록하며, write/edit path를 ledger에 기록합니다. |
| `tool_result` | dogfood tool result와 verification 성격의 `bash` result를 ledger에 기록합니다. |
| `session_start` | dogfood retention 정리, due GitHub source 최대 5개 확인, startup auto-update 실행, UI가 있으면 mode status 설정을 수행합니다. |
| `session_shutdown` | session별 repair state를 지우고 UI mode status를 제거합니다. |
| `before_agent_start` | effective work mode/intensity를 계산하고, eligible dogfood case를 시작하고, session runtime state를 저장하고, choco-pi policy prompt를 추가합니다. |
| `message_end` | dogfood case를 종료하고 web-analysis/coding/adoption-analysis/report/design mode-scoped quality guard를 실행합니다. |

### `todo-widget`

`extensions/todo-widget.ts`는 `todo` tool과 `/todos` command를 등록합니다.

구현된 tool action은 `list`, `add`, `set_status`, `update`, `remove`, `clear`입니다. 기본 저장소는 session scope입니다.

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

tool에서 `scope: "project"`를 사용하면 project-shared 저장소를 씁니다.

```text
<cwd>/.pi/todos.json
```

구현은 load 시 schema를 검증하고, write 시 atomic temp-file rename을 사용하고, path-level async lock으로 write를 직렬화하며, `force=true`가 없으면 active todo의 우발적 remove/clear를 보호합니다.

### `choco-footer`

`extensions/choco-footer/`는 custom footer를 설치하고 `session_start`, `before_agent_start`, `agent_start`, `turn_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`, `session_shutdown` 같은 Pi event에서 run state를 추적합니다.

Footer formatting code는 model label, project branch/version, cwd, thinking level, mode label, rate-limit text, context text, cost text, tool count, todo label, run state label을 지원합니다.

### `fff-search`

`extensions/fff-search/index.ts`는 FFF 기반 tool을 등록합니다.

- `grep`
- `find`
- `multi_grep`

또한 `/fff-mode`, `/fff-health`, `/fff-rescan`을 등록합니다. Native FFF engine이 있을 때 이를 사용하며, `find`와 `grep`에는 fallback 동작이 있습니다.

### `focus-rendering`

`extensions/focus-rendering/index.ts`는 Pi tool rendering을 runtime patch하여 focused tool-output rendering을 제공합니다. `session_start`에서 설치하고, `agent_start` 중 Pi 기본 working indicator를 숨기며, `session_shutdown`에서 상태를 복원합니다.

### `raw-paste`

`extensions/raw-paste/index.ts`는 `session_start`에서 editor component를 설치하고, `session_shutdown`에서 복원하며, `/paste` command로 bracketed raw paste mode를 등록합니다.

### `input-newline`

`extensions/input-newline/index.ts`는 `session_start`에서 extension text prompt가 multiline editor 동작을 사용할 수 있도록 patch합니다.

### `btw`

`extensions/btw.ts`는 한국어 side conversation overlay를 구현하고 다음 command를 등록합니다.

- `/btw`
- `/btw:tangent`
- `/btw:new`
- `/btw:clear`
- `/btw:inject`
- `/btw:summarize`
- `/btw:model`
- `/btw:thinking`

### `pi-lsp-client`

`package.json`은 `node_modules/pi-lsp-client/src/index.ts`를 extension dependency로 로드합니다.

## 구현된 Tools

| Tool | 구현 위치 | 역할 |
| --- | --- | --- |
| `spec_gate` | `dynamic-sdd.ts` | turn-local Working Spec start/list/clear, Spec Delta 기록, snapshot 생성. |
| `loop_transition` | `structural-gate.ts` | plan/todo boundary transition 기록. |
| `structural_gate` | `structural-gate.ts` | final acceptance/runtime/failure/verification/loop/completion review 기록. |
| `source_registry` | `index.ts` | external source list/add/watch/adopt/reject/due/changed/check. |
| `parallel_work_plan` | `parallel-work-plan-tool.ts` | parallel work를 위한 collision-avoidance plan 생성. |
| `reload_runtime` | `runtime-reload.ts` | 직접 reload 또는 tmux self-input fallback으로 Pi runtime resource reload. |
| `todo` | `todo-widget.ts` | session/project todo file 관리. |
| `grep`, `find`, `multi_grep` | `fff-search/index.ts` | FFF 기반 파일/content 검색. |

## Work Modes

Built-in work mode는 `extensions/choco-autopilot/mode.ts`에 정의되고 `modes/`에 설명되어 있습니다.

| Mode | 구현 설명 |
| --- | --- |
| `default` | root all-purpose policy baseline. 구현된 specialized mode를 session-scoped temporary overlay로 적용할 수 있습니다. |
| `coding` | TDD-first implementation/debugging/refactoring policy와 coding quality guard. |
| `report` | evidence-led report policy와 report quality guard. |
| `design` | product/UI design policy와 design quality guard. |
| `web-analysis` | retrieval-first external research policy와 web research quality guard. |
| `adoption-analysis` | external source/package/repo adoption review policy와 adoption quality guard. |

`/mode add`로 등록하는 custom mode는 `planned` 상태입니다. 현재 built-in code는 임의 custom mode를 executable work mode로 만들지 않습니다.

## Commands

| Command | 등록된 동작 |
| --- | --- |
| `/mode` | selector를 열거나 `status`, `list`, `set`, `add`, `remove`로 mode를 관리합니다. |
| `/intensity` | `micro`, `standard`, `deep`을 보거나 설정합니다. |
| `/effort` | 지원되는 model effort level을 보거나 설정합니다. |
| `/source` | `list`, `add`, `watch`, `adopt`, `reject`, `due`, `changed`, `check`로 source registry를 관리합니다. |
| `/memory` | memory를 보거나 durable memory candidate를 저장합니다. |
| `/ledger` | 현재 cwd/session ledger를 보거나 reset합니다. |
| `/dogfood` | dogfood status, weekly report, latest report, queue length, case explanation을 표시합니다. |
| `/update` | Pi update flow 또는 choco-pi self-update를 실행하고 auto-update 상태를 관리합니다. |
| `/reload-runtime` | extensions, skills, prompts, themes를 reload합니다. |
| `/todos` | 현재 session todo UI를 엽니다. |
| `/paste` | raw paste mode를 arm/cancel합니다. |
| `/btw*` | BTW side conversation을 관리합니다. |
| `/fff-*` | FFF search mode, health, rescan을 관리합니다. |

## Source Tracking

Source tracking은 `source-registry.ts`에 구현되어 있고 `/source`와 `source_registry`로 노출됩니다.

구현된 source kind:

- `github`
- `url`

구현된 status:

- `candidate`
- `watching`
- `adopted`
- `rejected`

GitHub check는 `git ls-remote <repo> HEAD`를 사용합니다. Non-GitHub URL은 model-led analysis가 필요하다는 메시지를 반환합니다. `session_start`는 due GitHub source를 최대 5개 확인하고 저장된 check metadata를 갱신합니다.

## Dogfood Data

Dogfood case capture는 `CHOCO_PI_IMPROVEMENT_MODE`와 `CHOCO_PI_IMPROVEMENT_PROFILE`로 제어됩니다. 현재 scope에서 capture가 활성화되면 case는 아래에 저장됩니다.

```text
~/.pi/agent/choco-pi/dogfood/
```

구현된 collector는 salted prompt hash, scope metadata, work mode, intensity, sanitized flow signals, tool counts, verification signals, structural gate signals, deterministic outcome fields를 저장합니다. Case record에는 raw prompt text를 저장하지 않습니다.

## 개발

의존성을 설치합니다.

```bash
pnpm install --frozen-lockfile
```

전체 프로젝트 게이트를 실행합니다.

```bash
pnpm run check
```

`pnpm run check`는 다음으로 확장됩니다.

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

사용 가능한 script:

```bash
pnpm run version:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check
```

`scripts/check-version-sync.ts`는 version 변경 시 package version, plugin version constant, README current-version line이 동기화되어 있는지 확인합니다.

## 저장소 구조

```text
extensions/choco-autopilot/   # main policy/state/guard/update/source/dogfood extension
extensions/choco-footer/      # footer formatting과 runtime hooks
extensions/fff-search/        # FFF 기반 find/grep/multi_grep
extensions/focus-rendering/   # focused tool-output rendering patch
extensions/input-newline/     # multiline extension prompt behavior
extensions/raw-paste/         # raw paste editor mode
extensions/btw.ts             # 한국어 side conversation overlay
modes/                        # built-in mode policy files
skills/                       # choco-autopilot, prd-architect skills
prompts/                      # prompt templates
tests/                        # subsystem tests
scripts/check-version-sync.ts # version consistency check
```
