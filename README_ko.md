# choco-pi

![choco-pi hero](assets/choco-pi-hero.png)

**choco-pi**는 Pi 코딩 에이전트를 더 일관된 로컬 작업 환경으로 쓰기 위한 비공개 Pi 패키지입니다. 런타임 확장, 두 개의 스킬, 프롬프트 템플릿, 작업 모드 정책, 지속 상태, 그리고 이를 검증하는 테스트를 함께 제공합니다.

[English README](README.md)

이 README는 실제로 구현된 동작만 설명합니다. 기준은 `package.json`, 확장 코드, 현재 테스트입니다.

## 상태

- 현재 패키지 버전: `0.13.6`.
- 라이선스 필드: `UNLICENSED`.
- 패키지 매니저: `pnpm@10.29.3`.
- 주요 peer 런타임: `@earendil-works/pi-coding-agent`.
- 기본 검증 스크립트: `pnpm run check`.

## choco-pi가 추가하는 것

choco-pi는 단독 앱이 아닙니다. Pi가 `package.json`의 `pi` 필드를 읽어 이 저장소의 구성요소를 로드합니다.

| 구성 영역 | 로드되는 항목 |
| --- | --- |
| Extensions | `extensions/choco-autopilot/index.ts`, `extensions/input-newline/index.ts`, `extensions/todo-widget.ts`, `extensions/choco-footer/index.ts`, `extensions/choco-header/index.ts`, `extensions/fff-search/index.ts`, `node_modules/pi-lsp-client/src/index.ts`, `extensions/focus-rendering/index.ts`, `extensions/raw-paste/index.ts`, `extensions/btw.ts` |
| Skills | `skills/choco-autopilot`, `skills/prd-architect` |
| Prompts | `prompts/` |

런타임에서는 위 항목을 통해 다음 기능이 추가됩니다.

- 계획, 실행, 검증, 메모리, ledger, source tracking, reload, update, quality gate를 다루는 autopilot 정책 레이어
- 세션/프로젝트 todo 도구와 `/todos` UI
- 커스텀 header/footer 렌더링
- FFF 기반 `grep`, `find`, `multi_grep` 도구
- 간결한 focused tool-output 렌더링
- raw paste와 확장 입력의 여러 줄 편집 동작
- 한국어 `/btw` 사이드 대화 오버레이
- `pi-lsp-client`에서 로드되는 LSP 클라이언트 확장

## 설치

대상 리비전이 GitHub에 올라간 뒤 설치합니다.

```bash
pi install git:github.com/ddotz/choco-pi
```

로컬 checkout에서 설치하려면 다음 순서로 실행합니다.

```bash
git clone https://github.com/ddotz/choco-pi.git /absolute/path/to/choco-pi
cd /absolute/path/to/choco-pi
pnpm install --frozen-lockfile
pnpm run check
pi install /absolute/path/to/choco-pi
```

이미 실행 중인 Pi 세션에는 설치 후 런타임 리로드를 적용합니다.

```text
/reload-runtime
```

## 런타임 동작

### Autopilot 정책

`extensions/choco-autopilot/index.ts`가 핵심 확장입니다. 에이전트 시작 시 choco-pi 정책 프롬프트를 추가하고, structural review, dynamic SDD, source tracking, 병렬 작업 계획, 런타임 리로드, memory, ledger, dogfood capture, update, work-mode control을 위한 도구와 명령을 설치합니다.

구현된 기본 정책은 다음과 같습니다.

- 사용자가 다른 언어를 요청하지 않으면 사용자에게 보이는 응답은 한국어를 기본으로 합니다.
- 응답은 존댓말을 사용하고, 과한 칭찬이나 단순 동의로 시작하지 않습니다.
- 응답 끝을 “원하면 …”처럼 제안형 opt-in 문장으로 마무리하지 않습니다.
- 새 Pi 기능을 만들 때는 처음부터 구현하기 전에 `https://pi.dev/packages`를 확인합니다.
- 작업 모드는 서로 격리되어야 하며, 한 모드가 다른 모드를 부작용으로 바꾸면 안 됩니다.
- 단순하지 않은 작업을 완료했다고 말하려면 관찰 가능한 검증과 structural review가 필요합니다.

### 작업 모드와 실행 강도

기본 제공 work mode는 `extensions/choco-autopilot/mode.ts`에 정의되어 있고 `modes/`에 문서화되어 있습니다.

| Mode | 역할 |
| --- | --- |
| `default` | 모든 작업의 기본 정책입니다. 필요한 경우 specialized mode를 세션 한정 오버레이로 적용할 수 있습니다. |
| `coding` | TDD-first 구현, 디버깅, 리팩터링, coding quality guard를 다룹니다. |
| `report` | 근거 중심 보고서 작성과 report quality guard를 다룹니다. |
| `design` | 제품/UI 디자인 작업과 design quality guard를 다룹니다. |
| `web-analysis` | 검색 우선 외부 조사와 web research quality guard를 다룹니다. |
| `adoption-analysis` | 외부 source/package/repo 채택 검토와 adoption quality guard를 다룹니다. |

Execution intensity는 프로세스의 무게를 정하는 값입니다. 현재 구현된 값은 `micro`, `standard`, `deep`입니다.

`/mode add`로 추가한 사용자 정의 모드는 `planned` 상태로 등록됩니다. 현재 built-in code는 임의의 사용자 정의 모드를 바로 실행 가능한 work mode로 만들지 않습니다.

### 스킬

`skills/choco-autopilot`은 메인 프롬프트와 확장이 사용하는 자율 실행 흐름을 설명합니다.

`skills/prd-architect`는 PRD, 제품 요구사항, 기획 문서 작업을 담당합니다. 라우팅 규칙은 다음과 같습니다.

- 모호한 아이디어: 먼저 탐색이나 brainstorming을 거친 뒤 PRD로 수렴합니다.
- 방향이 분명한 요청: `prd-architect`를 바로 사용합니다.
- 기존 PRD: 비평, 빈틈 분석, 보강에 `prd-architect`를 바로 사용합니다.

## 도구와 명령

### 도구

| Tool | 구현 위치 | 역할 |
| --- | --- | --- |
| `spec_gate` | `dynamic-sdd.ts` | 현재 턴의 Working Spec을 시작/조회/초기화하고, Spec Delta와 snapshot을 기록합니다. |
| `loop_transition` | `structural-gate.ts` | plan/todo 경계를 넘을 때 의도적인 transition을 기록합니다. |
| `structural_gate` | `structural-gate.ts` | 최종 acceptance, runtime, failure mode, verification, loop, completion review를 기록합니다. |
| `source_registry` | `index.ts` | 외부 source를 list/add/watch/adopt/reject/due/changed/check 동작으로 관리합니다. |
| `branch_switch_guard` | `branch-switch-guard.ts` | 현재 세션 cwd를 대상으로 dirty 상태와 worktree branch 점유를 확인한 뒤 안전하게 branch를 전환합니다. |
| `parallel_work_plan` | `parallel-work-plan-tool.ts` | 쓰기 작업이 있는 병렬 작업 전에 충돌 방지 계획을 만듭니다. |
| `worktree_manage` | `worktree-manage-tool.ts` | 격리 git worktree를 계획, 생성, 조회, 상태 확인, handoff, merge-ready 검사, clean-remove합니다. |
| `agent_orchestrator` | `agent-orchestrator-tool.ts` | manifest 기반 병렬 agent run을 시작, dispatch, 상태 갱신, 요약, 종료합니다. |
| `integration_verifier` | `integration-verifier-tool.ts` | manifest 기반 병렬 lane의 최종 통합 검증을 실행하고 완료 전 evidence를 제공합니다. |
| `reload_runtime` | `runtime-reload.ts` | Pi 런타임 리소스를 직접 reload하거나 tmux self-input fallback으로 reload합니다. |
| `todo` | `todo-widget.ts` | 세션 또는 프로젝트 todo 파일을 관리합니다. |
| `grep`, `find`, `multi_grep` | `fff-search/index.ts` | FFF 기반으로 파일과 내용을 검색합니다. |

### Slash commands

| Command | 동작 |
| --- | --- |
| `/mode` | selector를 열거나 `status`, `list`, `set`, `add`, `remove`로 mode를 관리합니다. |
| `/intensity` | `micro`, `standard`, `deep` 값을 확인하거나 설정합니다. |
| `/effort` | 지원되는 model effort level을 확인하거나 설정합니다. |
| `/source` | source registry record를 관리합니다. |
| `/memory` | memory를 조회하거나 durable memory candidate를 저장합니다. |
| `/ledger` | 현재 cwd/session ledger를 조회하거나 reset합니다. |
| `/dogfood` | dogfood status, weekly report, latest report, queue length, case explanation을 표시합니다. |
| `/update` | Pi update flow, choco-pi self-update, auto-update 상태 관리를 실행합니다. |
| `/reload-runtime` | extensions, skills, prompts, themes를 reload합니다. |
| `/todos` | 현재 세션 todo UI를 엽니다. |
| `/paste` | raw paste mode를 arm/cancel합니다. |
| `/btw*` | 한국어 사이드 대화를 관리합니다. |
| `/fff-*` | FFF search mode, health, rescan을 관리합니다. |

## 상태와 데이터

### Runtime state

메인 상태 파일은 다음 위치에 있습니다.

```text
~/.pi/agent/choco-pi/state.json
```

현재 state schema version은 `4`입니다. state object에는 다음 정보가 저장됩니다.

- `runtime`: persistent work mode와 execution intensity
- `sessions`: 세션별 effective work mode, suggested mode, automatic-mode flag, execution intensity, timestamp
- `memories`: `/memory`로 저장한 durable fact
- `ledgers`: cwd/session key 기반 context ledger
- `sourceRegistry`: external source tracking record
- `workModeRegistry`: built-in/custom work-mode metadata
- `autoUpdate`: choco-pi auto-update 설정과 마지막 결과

Context ledger는 objective, assumptions, decisions, changed files, verifications, blockers, risks, next actions를 기록합니다. 현재 자동 ledger 업데이트는 write/edit path와 verification 성격의 `bash` result를 중심으로 저장합니다.

### Todo 저장소

`todo` 도구는 기본적으로 현재 cwd 아래에 세션별 todo를 저장합니다.

```text
<cwd>/.pi/sessions/<sessionId>/todos.json
```

프로젝트 공유 todo는 다음 위치를 사용합니다.

```text
<cwd>/.pi/todos.json
```

Todo 저장은 schema validation을 거치고, path-level async lock으로 직렬화되며, atomic temp-file rename으로 처리됩니다. `force=true`가 없으면 active todo가 실수로 remove/clear되지 않도록 보호합니다.

### Source tracking

Source tracking은 `source-registry.ts`에 구현되어 있으며 `/source`와 `source_registry`로 노출됩니다.

- Source kind: `github`, `url`
- Status: `candidate`, `watching`, `adopted`, `rejected`
- GitHub check는 `git ls-remote <repo> HEAD`를 사용합니다.
- Non-GitHub URL check는 model-led analysis가 필요하다는 메시지를 반환합니다.
- `session_start`는 due GitHub source를 최대 5개 확인하고 저장된 metadata를 갱신합니다.

### Dogfood data

Dogfood capture는 `CHOCO_PI_IMPROVEMENT_MODE`와 `CHOCO_PI_IMPROVEMENT_PROFILE`로 제어됩니다. 활성화된 경우 case record는 다음 위치에 저장됩니다.

```text
~/.pi/agent/choco-pi/dogfood/
```

수집기는 salted prompt hash, scope metadata, work mode, intensity, sanitized flow signal, tool count, verification signal, structural-gate signal, deterministic outcome field를 저장합니다. Case record에는 raw prompt text를 저장하지 않습니다.

## 개발

의존성을 설치합니다.

```bash
pnpm install --frozen-lockfile
```

전체 프로젝트 게이트를 실행합니다.

```bash
pnpm run check
```

`pnpm run check`는 다음 명령으로 확장됩니다.

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

사용 가능한 스크립트:

```bash
pnpm run version:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check
```

`scripts/check-version-sync.ts`는 `package.json`, `extensions/choco-autopilot/version.ts`, README current-version line이 서로 동기화되어 있는지 확인합니다.

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
