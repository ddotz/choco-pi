# choco-pi 현재 버전 전체 기능 크리틱 보고서

**대상 버전:** `choco-pi` 0.9.2
**대상 리비전:** `7416634` (`main`, 2026-05-12 00:28:48 +0900)  
**작성일:** 2026-05-12  
**목적:** 현재 구현 기준으로 전체 기능과 모든 work mode를 순차 검토해 향후 개발 우선순위를 정한다.  
**독자:** choco-pi 개발 의사결정자
**범위:** `README.md`, `docs/`, `modes/`, `skills/`, `prompts/`, `extensions/`, `tests/`, 현재 런타임 상태와 품질 게이트 결과.

---

## 1. Executive summary

현재 choco-pi는 “default-root all-purpose generalist” 철학을 명확히 잡았고, mode isolation·todo 보존·structural gate·quality guard·source registry·runtime reload·UI 편의 기능까지 폭넓게 구현되어 있습니다. 전체 테스트도 `232 passed`로 통과했습니다. 그러나 완전자율 철학 기준에서는 몇 가지 핵심 런타임 단절이 남아 있습니다.

핵심 결론은 다음입니다.

1. **가장 먼저 고칠 것은 structural gate의 차단/대기 종료 흐름입니다.** 현재 구현은 `readyToComplete=false`를 항상 실패로 처리하므로, 승인 경계나 외부 블로커처럼 “멈추고 보고해야 하는 상태”도 hidden repair loop로 되돌릴 수 있습니다.
2. **`/btw` side session은 가장 큰 guardrail 우회 경로입니다.** 별도 `AgentSession`이 `read/bash/edit/write`를 쓰면서 choco-autopilot guard를 로드하지 않습니다. 사이드 대화가 실제 파일/명령을 실행할 수 있어 approval boundary와 structural gate를 우회할 수 있습니다.
3. **UI 확장 간 load-order 충돌이 있습니다.** `raw-paste`가 기존 editor factory를 감싸지 않고 교체해 `fff-search`의 @mention autocomplete를 덮을 수 있습니다. footer도 설치된 패키지 버전·effective mode를 정확히 표시하지 못합니다.
4. **mode 정책은 강하지만 일부는 prompt-only입니다.** report/web/adoption/coding guard는 최종 답변 모양을 검사하지만, 실제 source retrieval, TDD 순서, source registry 실행, artifact 생성 여부까지 보장하지 않습니다.
5. **문서와 현재 구현이 일부 불일치합니다.** `README.md`와 runtime은 모든 built-in mode가 implemented라고 말하지만 `docs/design.md`는 “Only default work mode is implemented”라고 남아 있습니다.

**개발 우선순위:** ① blocker/approval-boundary clean exit, ② `/btw` guard 적용 또는 read-only화, ③ editor/footer load-order·상태 표시 보정, ④ evidence/tool-use 신호 기반 품질 강화, ⑤ 문서/모드 정책 동기화 순서가 적절합니다.

**Confidence: High** — 정적 코드 확인, Pi 공식 extension 문서 확인, 현재 state 확인, full quality gate 통과를 근거로 판단했습니다. 단, 실제 TUI 화면 렌더링은 헤드리스로 검증하지 못해 UI 시각 상태는 코드·테스트 기반 추론입니다.

---

## 2. Evidence ledger

| ID | 핵심 근거 | 출처/위치 | 확인 방법 | 품질 | 신뢰도 |
| --- | --- | --- | --- | --- | --- |
| E1 | 패키지 버전 0.9.2, Pi extension 9개, skills/prompts 등록 | `package.json` | 파일 읽기·`node` 확인 | 직접 | High |
| E2 | 현재 리비전 `7416634`, `main`, `origin/main` | git | `git log -1` | 직접 | High |
| E3 | 공식 Pi extension 문서는 extension tool/hook, custom editor composition, reload, state, tool override 규칙을 정의 | Pi docs `docs/extensions.md`, `docs/tui.md`, `docs/packages.md` | 문서 읽기 | 1차 문서 | High |
| E4 | 모든 built-in work mode는 implemented: default, web-analysis, adoption-analysis, report, coding | `extensions/choco-autopilot/mode.ts`, `README.md`, `work-mode-registry.ts` | 파일 읽기 | 직접 | High |
| E5 | 현재 세션 effective mode는 report, persistent mode는 default | `~/.pi/agent/choco-pi/state.json` | 파일 읽기 | 런타임 상태 | High |
| E6 | `buildAutopilotSystemPrompt()`는 base 철학, mode overlay, approval boundary, loop governance, structural gate를 주입 | `policy.ts` | 파일 읽기 | 직접 | High |
| E7 | `structural_gate`는 `readyToComplete=false`를 실패로 처리 | `structural-gate.ts`, `tests/structural-gate.test.ts` | 파일·테스트 읽기 | 직접 | High |
| E8 | `loop_transition`은 todo done 이후 transition 수를 강제하고 새 todo 추가를 감지 | `structural-gate.ts` | 파일 읽기 | 직접 | High |
| E9 | approval-boundary는 배포·결제·secret/account·대규모 삭제·외부 전송·irreversible bash/write/edit을 차단 | `approval-boundary.ts`, `tests/approval-boundary.test.ts` | 파일·테스트 읽기 | 직접 | High |
| E10 | todo는 session scope 기본, project scope 선택, active remove/clear 보호, atomic rename·lock 구현 | `todo-widget.ts`, `tests/todo-widget.test.ts` | 파일·테스트 읽기 | 직접 | High |
| E11 | context ledger는 changed files와 bash verification만 자동 기록하고 assumptions/decisions/risks/nextActions 기록 tool은 없음 | `context-ledger.ts`, `index.ts`, `tests/ledger-auto-record.test.ts` | 파일·테스트 읽기 | 직접 | High |
| E12 | report/coding/web/adoption quality guard는 mode-scoped message_end repair를 수행 | `*-quality.ts`, 관련 tests | 파일·테스트 읽기 | 직접 | High |
| E13 | report mode는 evidence ledger, section-only/cross-section/whole-report pass, Kami layout, im-not-ai polishing을 요구 | `modes/report/MODE.md`, `report-policy.ts` | 파일 읽기 | 직접 | High |
| E14 | coding mode는 TDD-first, systematic debugging, surgical changes, full gate를 요구하지만 “unclear면 ask” 문구가 있음 | `modes/coding/MODE.md`, `coding-policy.ts` | 파일 읽기 | 직접 | High |
| E15 | mode resource policy는 `insane-search`, `kami`, `gstack`을 “active by policy”로 표기하지만 현재 available skills 목록에는 `kami/gstack/insane-search`가 없음 | 현재 세션 skill inventory, `mode-resource-policy.ts` | 런타임 prompt·파일 확인 | 직접 | High |
| E16 | `/btw`는 별도 AgentSession을 만들고 tools `read/bash/edit/write`, empty extension runtime/resource loader를 사용 | `extensions/btw.ts` | 파일 읽기 | 직접 | High |
| E17 | raw-paste는 `ctx.ui.setEditorComponent()`로 새 editor를 설정하나 이전 factory를 감싸지 않음 | `raw-paste/index.ts`, Pi docs custom editor composition | 파일·문서 확인 | 직접 | High |
| E18 | fff-search는 editor factory를 감싸 @mention provider를 추가함 | `fff-search/index.ts` | 파일 읽기 | 직접 | High |
| E19 | footer는 version을 `~/code/choco-pi/package.json`에서 읽고, 현재 설치 경로에는 해당 파일이 없었음 | `choco-footer/index.ts`, shell 확인 | 파일·명령 확인 | 직접 | High |
| E20 | footer mode label은 persistent `runtime.workMode`만 읽어 effective overlay를 표시하지 않음 | `choco-footer/index.ts`, state | 파일·상태 확인 | 직접 | High |
| E21 | auto-update는 update 후 `pnpm run version:check`만 검증하고 reload할 수 있음 | `auto-update.ts` | 파일 읽기 | 직접 | High |
| E22 | `docs/design.md`는 “Only default work mode is implemented”라고 하여 README/runtime과 충돌 | `docs/design.md`, `README.md` | 파일 읽기 | 직접 | High |
| E23 | full quality gate는 `pnpm install --frozen-lockfile` 후 통과: version check, lint, typecheck, 52 files/232 tests | shell | `pnpm run check` | 직접 | High |
| E24 | 현재 cwd가 `$HOME`이면 `multi_grep`은 native FFF 부재/비활성 시 fallback 없이 실패 메시지를 반환 | 실제 tool call, `fff-search/index.ts` | 도구 호출·파일 확인 | 직접 | High |

---

## 3. Main report

### 3.1 현재 기능 구조 요약

현재 choco-pi는 Pi package로 로드됩니다. `package.json`의 `pi.extensions`는 autopilot, input-newline, todo-widget, footer, fff-search, pi-lsp-client, focus-rendering, raw-paste, btw를 순서대로 등록합니다. 이 구조는 Pi 공식 package/extension 모델과 부합합니다.

핵심 runtime은 `choco-autopilot`입니다. 이 extension은 `before_agent_start`에서 policy prompt를 주입하고, `tool_call`에서 approval boundary와 changed-file ledger를 처리하며, `tool_result`에서 verification command를 기록하고, `message_end`에서 structural/report/web/coding/adoption guard를 실행합니다.

작업 모드는 persistent mode와 effective overlay로 분리되어 있습니다. 현재 state 기준 persistent mode는 `default`, 이 세션 effective mode는 `report`입니다. 이 설계는 “기본은 generalist, 필요 시 전문 overlay”라는 철학에 잘 맞습니다.

테스트 범위는 넓습니다. approval boundary, completion boundary, source registry, todo, structural gate, mode quality, footer core, fff formatting, raw paste, runtime reload, worktree planner 등 52개 test file과 232개 test가 통과했습니다.

### 3.2 최우선 크리틱

#### P0-1. Blocker/approval-boundary 상태를 깨끗하게 보고하고 멈출 수 없습니다

`structural_gate`는 `readyToComplete=false`를 항상 실패로 처리합니다. 그러나 base 철학은 “승인 경계에서는 멈추고 concrete blocker를 보고”해야 합니다. 지금 구현에서는 계정/secret/외부 승인처럼 더 진행하면 안 되는 상태도 gate 실패가 되어 hidden repair follow-up으로 재개될 수 있습니다.

이 문제는 완전자율 철학과 직접 충돌합니다. 자율성은 “계속 진행”만이 아니라 “멈춰야 할 때 정확히 멈춤”을 포함합니다. 현재는 필요한 대기 상태를 정상 종료로 표현하는 경로가 약합니다.

**권장 수정:** `structural_gate`에 `outcome: complete | blocked | deferred` 또는 `blockedToComplete=true` 같은 상태를 추가합니다. `readyToComplete=false`라도 approval boundary, missing secret, external private transfer, logically impossible task처럼 명시 blocker가 있으면 final blocker report를 허용해야 합니다.

#### P0-2. `/btw` side session이 핵심 guardrail을 우회할 수 있습니다

`/btw`는 별도 `AgentSession`을 만들고 tools를 `read/bash/edit/write`로 제공합니다. 그런데 resource loader는 extension을 비워 둡니다. 따라서 side session은 approval-boundary, structural gate, ledger, todo governance, commit hygiene guard를 받지 않습니다.

사이드 대화 prompt가 “메인 작업을 이어받지 말라”고 안내하지만, hard guard가 아닙니다. 사용자가 `/btw`에서 “이 파일 고쳐봐”라고 하면 별도 session이 실제 파일을 수정할 수 있는 구조입니다. 이는 guardrail 명확성과 flow 안전성 양쪽에서 가장 큰 우회 경로입니다.

**권장 수정:** 기본 `/btw`는 read-only tools로 제한합니다. write/bash가 필요하면 main session으로 inject하거나, side session에도 approval-boundary와 structural gate를 포함한 최소 choco guard runtime을 로드합니다.

#### P1-1. Editor 확장 load-order 충돌이 있습니다

`fff-search`는 이전 editor factory를 감싸 @mention autocomplete를 추가합니다. 그러나 이후 로드되는 `raw-paste`는 이전 factory를 감싸지 않고 새 `RawPasteEditor`로 교체합니다. Pi 공식 TUI 문서는 custom editor를 조합할 때 이전 factory를 캡처해 감싸라고 안내합니다.

결과적으로 raw paste가 활성화된 세션에서 FFF @mention autocomplete가 사라질 수 있습니다. 이는 사용자가 도구 탐색·파일 참조를 기대하는 흐름에서 누락입니다.

**권장 수정:** `raw-paste`도 `ctx.ui.getEditorComponent()`를 읽고 previous editor를 wrapping해야 합니다. 또는 editor stack helper를 만들어 FFF와 raw-paste가 같은 composition 규칙을 공유하게 합니다.

#### P1-2. Footer가 현재 runtime 상태를 정확히 보여주지 못합니다

Footer version은 `~/code/choco-pi/package.json`에서 읽습니다. 현재 설치 경로는 `~/.pi/agent/git/github.com/ddotz/choco-pi`이며 `~/code/choco-pi/package.json`은 없었습니다. 따라서 footer version이 비거나 틀릴 수 있습니다.

또한 footer mode label은 `state.runtime.workMode`만 읽습니다. 현재 세션처럼 persistent `default` 위에 effective `report` overlay가 적용된 경우 footer는 effective mode를 보여주지 않습니다. Autopilot이 `ctx.ui.setStatus("mode", ...)`로 더 풍부한 status를 설정해도 custom footer가 extension statuses를 렌더링하지 않아 사용자가 보기 어렵습니다.

**권장 수정:** package root는 `import.meta.url` 기반으로 계산합니다. footer line 2에는 `default->report/standard@0.9.2`처럼 persistent/effective/intensity/version을 직접 표시합니다.

#### P1-3. Context ledger의 기록 계약과 실제 기능이 다릅니다

정책은 assumptions, decisions, changed files, verification, blockers, risks, next actions를 Context Ledger에 유지하라고 합니다. 그러나 자동 기록은 edit/write changed files와 bash verification에 사실상 한정됩니다. assumptions/decisions/risks/next actions를 LLM이 구조적으로 저장할 tool이 없습니다.

이는 긴 작업에서 특히 중요합니다. 사용자가 “아침에 보고 판단”할 정도의 긴 작업을 맡길 때, 내부 결정과 가정이 ledger에 남지 않으면 세션 회복성과 리뷰 가능성이 떨어집니다.

**권장 수정:** `context_ledger` tool을 추가해 `assumption|decision|risk|blocker|next_action`을 append할 수 있게 합니다. 또는 `structural_gate`와 `loop_transition` 입력을 ledger에도 반영합니다.

#### P1-4. Mode-scoped resource가 실제 사용 가능성과 분리되어 있습니다

report/web/adoption/coding mode resource policy는 `insane-search`, `kami`, `gstack` 등을 “active by policy”로 표기합니다. 현재 세션의 available skills에는 해당 이름들이 없습니다. 정책 아이디어로는 맞지만, runtime capability처럼 보이면 agent가 없는 도구를 쓴 것처럼 말하거나, 불필요하게 blocker를 만들 수 있습니다.

**권장 수정:** resource policy를 “preferred/expected external resource”와 “available in current runtime”으로 분리합니다. 없는 경우에는 fallback 절차와 confidence 하향 규칙을 prompt에 명시합니다.

#### P1-5. Auto-update 검증이 reload 위험에 비해 얕습니다

`runChocoPiUpdate()`는 update 후 `pnpm run version:check`만 실행하고 `updated`로 간주할 수 있습니다. extension code가 깨져도 version sync만 통과하면 reload될 수 있습니다. 이것은 “자율 self-update” 기능의 failure mode입니다.

**권장 수정:** auto-update는 최소 `version:check && typecheck`를 실행하고, runtime extension 파일 변경이 있으면 targeted tests 또는 full `pnpm run check`를 기본값으로 둡니다. 시간 제한 때문에 full gate를 생략하면 footer/notification에 “verification: partial”을 표시합니다.

### 3.3 가드레일 명확성 평가

Approval boundary는 비교적 명확합니다. 배포, publishing, 결제, secret/account, 대규모 삭제, 외부 private-data transfer, irreversible command를 tool_call 단계에서 차단합니다. 정상적인 `git push`는 routine source sync로 허용하는 정책도 코드와 테스트가 일치합니다.

Structural gate는 강력하지만 완료/차단 상태 모델이 단일합니다. `High + readyToComplete=true`만 성공입니다. 이 구조는 “완료 주장 방지”에는 효과적이지만, “승인 경계에서 멈춰 보고”하는 합법적 종료를 막습니다.

Loop governance는 todo done 이후 `loop_transition` 강제가 있어 좋습니다. 다만 새 작업 감지는 `todo.add` 이후에 한정됩니다. 텍스트로 새 작업을 언급하거나 파일 변경 중 scope creep이 생기는 경우는 prompt discipline에 의존합니다.

Mode quality guard는 mode isolation과 output shape에는 좋습니다. 그러나 report/web/adoption/coding 모두 실제 근거 행위를 완전 검증하지는 않습니다. 이 수준은 MVP로 합리적이지만, High confidence의 의미를 강화하려면 tool-use/evidence 신호가 더 필요합니다.

### 3.4 Flow 전환 누락 평가

`before_agent_start → tool_call/tool_result → message_end` 흐름은 Pi 공식 extension lifecycle과 맞습니다. state 저장, source check, dogfood case 시작/종료, mode overlay 결정도 같은 축에서 이루어집니다.

누락은 주로 cross-extension과 nested session에서 발생합니다. `raw-paste`와 `fff-search`는 둘 다 editor component를 소유하므로 composition이 필요하지만 현재는 마지막 writer가 이깁니다. `/btw`는 nested `AgentSession`을 만들면서 main extension guards를 로드하지 않습니다.

`/reload-runtime` 흐름은 설계가 좋습니다. direct reload, tmux self-input, editor prefill, resume marker가 있고 Pi docs의 `ctx.reload()` footgun도 반영되어 있습니다. 다만 reload 후 “continue”가 실제 업무 범위 안에서 안전한지는 structural gate와 연결되어야 합니다.

Todo subsystem은 session scope를 잘 지킵니다. `/new` 시 현재 session todo만 clear하고 sibling session은 보존합니다. 이 부분은 multi-session 철학과 잘 맞습니다.

### 3.5 완전자율 철학 적합성 평가

Base/default 정책은 완전자율 철학에 강하게 부합합니다. routine clarification을 금지하고, reversible default를 고르고, approval boundary만 묻도록 설계되어 있습니다.

문제는 일부 mode overlay와 runtime edge가 이 철학을 약화한다는 점입니다. Coding mode의 “unclear면 ask instead of guessing” 문구는 base의 “safe default가 있으면 계속”보다 넓게 해석될 수 있습니다. 이 문구는 “요구가 모순되거나 안전한 default가 없을 때만 묻는다”로 좁혀야 합니다.

반대로 필요한 대기 상태는 잘 표현되지 않습니다. Approval boundary에 부딪혔을 때는 사용자를 기다려야 하지만, structural gate가 blocker final을 성공적으로 통과시키지 못합니다. 즉 “기다리지 않아도 되는 곳에서 기다리는 문제”와 함께 “기다려야 하는 곳을 정상 보고하지 못하는 문제”가 동시에 있습니다.

자율 철학 관점의 핵심 개선은 “ask less”가 아니라 “continue/stop/defer/blocked를 정확히 분리”하는 것입니다.

### 3.6 Mode별 크리틱

#### default mode

Default mode는 현재 가장 안정적입니다. 사용자 요청을 하나의 managed project로 보고, implemented overlay를 temporary effective mode로 적용하는 구조가 좋습니다. 현재 inference도 `보고서` 요청은 report, URL 분석은 web-analysis, bug/test 요청은 coding으로 잘 라우팅됩니다.

보완점은 user-visible state입니다. `/mode status`는 persistent mode만 보여주고, footer도 effective overlay를 보여주지 않습니다. default가 자동 overlay를 쓰는 철학을 유지하려면, 사용자가 나중에 상태를 볼 수 있는 진단 표시가 필요합니다.

#### coding mode

Coding mode는 TDD-first, systematic debugging, surgical diff, full gate를 명확히 요구합니다. bugfix final에 RED/Root cause/Fix/GREEN을 요구하는 guard도 실용적입니다. 현재 test도 hollow “확인했습니다” verification을 거부합니다.

부족한 부분은 두 가지입니다. 첫째, “unclear면 ask” 문구가 완전자율 base보다 넓습니다. 둘째, TDD 순서와 UI/browser QA는 prompt-only에 가깝습니다. production file edit 이전에 test command가 있었는지, UI 변경에 gstack/manual QA가 있었는지 dogfood 신호로라도 기록해야 합니다.

#### report mode

Report mode는 현재 사용자 요구에 가장 잘 맞는 모드입니다. evidence ledger, section-first drafting, cross-section pass, whole-report pass, numeric consistency, Kami layout, im-not-ai polishing까지 이미 상세합니다. 이전 report critic에서 지적됐던 “report quality guard 없음”은 현재 `report-quality.ts`로 보완되었습니다.

다만 artifact 생성 절차는 mode 정책에 충분히 운영화되어 있지 않습니다. report mode는 최종 답변 계약을 정의하지만, file-based report의 `MD → DOCX/PDF → artifact QA` 단계, evidence sidecar, citation integrity, PDF layout QA는 명시적 체크리스트가 아닙니다.

**권장 추가 절차:** objective lock → evidence ledger → section map → section draft/review → cross-section review → whole-report critique → MD write → DOCX/PDF conversion → artifact openability/size QA → final evidence note.

#### web-analysis mode

Web-analysis mode는 retrieval-first와 provenance를 잘 정의합니다. High confidence에 2개 이상의 provenance와 critical review를 요구하는 guard도 유용합니다.

보완점은 실제 retrieval evidence입니다. final answer에 URL 두 개가 있으면 통과할 수 있지만, 실제 retrieval tool이 호출됐는지는 보장하지 않습니다. 또한 Korean-default 환경인데 guard section label은 English 중심입니다.

#### adoption-analysis mode

Adoption-analysis mode는 default adoption capability를 대체하지 않는다고 명확히 적고, decision/depth/fit/risk/scope/tracking/confidence 계약을 갖습니다. Adoption depth ladder도 적절합니다.

보완점은 watch와 evidence threshold입니다. `Decision: watch`에도 adoption depth를 강제하면 가짜 정밀도가 생길 수 있습니다. 또한 dependency/fork/vendor 깊이에서는 license/security/freshness 최소 증거를 더 엄격히 요구해야 합니다.

### 3.7 기능별 순차 크리틱

#### Package/load model

Pi package manifest는 명시적이고 공식 package 모델에 맞습니다. extension load order는 문서화되어 있으나, editor component 소유 extension 간 충돌을 고려한 owner/composition 규칙은 없습니다.

#### Autopilot state

State schema v4는 runtime, sessions, memories, ledgers, sourceRegistry, workModeRegistry, autoUpdate를 담습니다. session effective mode도 저장됩니다. 그러나 footer·command가 이 session effective state를 충분히 노출하지 않습니다.

#### Approval boundary

차단 기준은 명확합니다. 다만 slash command 내부 작업과 nested agent 작업은 동일 guard를 자동으로 타지 않습니다. 특히 `/btw`가 문제입니다.

#### Structural/loop gate

완료 주장 방지는 강합니다. 그러나 blocker exit 모델이 없습니다. `readyToComplete=false`가 final report 허용이 아니라 repair loop로 가는 구조는 completion boundary와 충돌합니다.

#### Todo subsystem

Session isolation, project scope, active clear/remove 보호, atomic write는 우수합니다. UI `/todos` clear는 confirm을 거치므로 사용자 직접 조작으로 볼 수 있습니다. Tool path와 UI path의 삭제 정책 차이는 문서에 명확히 남기는 것이 좋습니다.

#### Context ledger/memory

Memory는 명시 저장 방식이라 과저장을 막습니다. Ledger는 자동 changed file/verification 기록이 유용하지만, 정책이 요구하는 assumption/decision/risk 기록 수단이 부족합니다.

#### Source registry/package adoption

GitHub source 주간 check와 adoption metadata는 유용합니다. Non-GitHub URL은 model-led 분석으로 남는 한계를 final answer에 표시해야 합니다. Package reuse check는 아직 prompt-only입니다.

#### Runtime reload/update

Reload tool은 현재 Pi docs와 잘 맞습니다. Auto-update는 local changes skip도 안전합니다. 다만 update 후 검증이 version sync에 치우쳐 있습니다.

#### Parallel work/worktrees

`parallel_work_plan`은 file/domain ownership, conflict merge, lane cap, dependency lane을 계산합니다. 실제 spawning은 구현하지 않으므로 “계획 도구”로 보는 것이 정확합니다. Prompt에는 worktree-first 철학이 잘 반영되어 있습니다.

#### FFF search

`find`/`grep`은 FFF 실패 시 built-in fallback이 있습니다. `multi_grep`은 fallback 없이 “native engine required”를 반환합니다. HOME cwd처럼 FFF가 비활성인 세션에서는 multi_grep이 실질적으로 쓸 수 없습니다.

#### Input newline/raw paste

`input-newline`은 extension input을 multiline editor로 라우팅해 Ctrl+J 일관성을 높입니다. 그러나 placeholder/prefill을 넘기지 않아 `/todos` add/edit 같은 입력 흐름이 덜 친절해질 수 있습니다. `raw-paste`는 editor composition 충돌이 핵심입니다.

#### Footer/focus rendering

Focus rendering은 tool output compact view를 제공합니다. Prototype patch 방식이라 Pi 내부 변경에 취약하지만 tests가 있습니다. Footer는 상태 표시 목적은 좋으나 현재 package root/effective mode 반영이 부족합니다.

#### BTW side conversation

사용자 경험 측면에서는 강력합니다. 그러나 별도 session이 write-capable tools를 갖고 guard extension을 제외하는 구조는 철학적으로 위험합니다. side conversation은 read-only tangent 또는 main-session inject가 기본이어야 합니다.

#### Dogfood quality system

Privacy-preserving dogfood 구조는 방향이 좋습니다. 다만 repairQueued 신호가 실제 guard repair와 충분히 연결되지 않고, user steering signals도 비어 있습니다. 자동 개선 기준은 보수적이라 안전하지만, 관측 신호 품질을 더 높여야 합니다.

#### Docs/tests

테스트는 넓고 빠릅니다. `pnpm run check`는 dev deps 설치 후 통과했습니다. 문서는 일부 drift가 있습니다. `docs/design.md`는 현재 구현을 반영하지 않습니다.

### 3.8 권장 개발 로드맵

#### 1순위: 자율 종료 상태 모델 정리

- `structural_gate` 결과를 `complete`, `blocked`, `deferred`로 분리합니다.
- blocker final은 `readyToComplete=false`여도 사용자에게 보고 가능해야 합니다.
- 승인 경계·secret/account·외부 private-data transfer·논리 모순은 clean blocker report로 종료합니다.

#### 2순위: `/btw` guard 우회 제거

- 기본 tools를 read-only로 제한합니다.
- write/bash가 필요하면 main session으로 inject하도록 유도합니다.
- 또는 side AgentSession에도 approval-boundary와 structural gate를 로드합니다.

#### 3순위: UI composition과 상태 표시 보정

- `raw-paste`가 previous editor factory를 감싸게 합니다.
- footer package root를 설치 경로 기준으로 고칩니다.
- footer에 `persistent->effective/intensity@version`을 표시합니다.
- FFF HOME cwd의 `multi_grep` fallback을 추가합니다.

#### 4순위: evidence/tool-use 기반 품질 신호 강화

- web-analysis: retrieval-capable tool call 여부와 distinct host/source family를 기록합니다.
- adoption-analysis: dependency/fork/vendor 깊이에 license/security/freshness minimum evidence를 요구합니다.
- coding: production edit 전 test command 여부를 dogfood review signal로 기록합니다.
- report: artifact pipeline과 evidence sidecar 규칙을 mode에 추가합니다.

#### 5순위: 문서·정책 drift 제거

- `docs/design.md`를 현재 implemented modes 상태로 갱신합니다.
- coding mode의 “ask instead of guessing”을 base autonomy와 정렬합니다.
- resource policy의 “active skills” 표현을 availability-aware로 바꿉니다.

---

## 4. Critical review

### 강한 근거

코드와 테스트가 직접 확인된 항목은 신뢰도가 높습니다. 특히 structural gate, todo, mode quality guard, source registry, footer/raw-paste/btw 구현은 파일과 테스트로 검증했습니다.

### 약한 근거

실제 TUI 렌더링은 화면 캡처로 확인하지 않았습니다. Footer와 editor 충돌은 코드 경로와 Pi 공식 문서 기반의 높은 신뢰도 추론이지만, 실제 화면 증거는 아닙니다.

### 결론을 바꿀 수 있는 정보

Pi runtime이 custom footer 안에서도 extension statuses를 자동 합성해 보여준다면 footer effective mode 표시 문제는 약해집니다. 또한 `/btw`의 별도 AgentSession에 외부에서 global tool_call guard가 적용된다면 `/btw` 위험도는 낮아집니다. 현재 코드상으로는 그 근거를 확인하지 못했습니다.

### 현재 보고서의 한계

이 보고서는 결함을 수정하지 않고 우선순위를 제시하는 산출물입니다. 품질 게이트는 통과했지만, 문서 산출물 생성 외에 runtime reload나 TUI dogfood는 수행하지 않았습니다.

---

## 5. Appendix: Verification

- `git log -1 --oneline --decorate --date=iso --format='%h %d %ad %s'`  
  → `7416634 (HEAD -> main, origin/main, origin/HEAD) 2026-05-12 00:28:48 +0900 fix: soften update skip notification`
- `node -e "const p=require('./package.json'); console.log(p.version, p.pi.extensions.length, p.pi.skills.join(','), p.pi.prompts.join(','))"`  
  → `0.9.2 9 skills prompts`
- 첫 `pnpm run check`  
  → 실패: `oxlint: command not found`
- `pnpm install --frozen-lockfile`  
  → devDependencies 포함 설치 완료
- 재실행 `pnpm run check`  
  → version sync OK, lint 0 warnings/errors, typecheck OK, vitest `52 passed`, `232 passed`
- `git status --short --untracked-files=all`  
  → 기존 untracked `package-lock.json` 존재. 보고서 산출 전 기준으로도 untracked였습니다.

---

## 6. Final confidence

**Confidence: High**

이 보고서는 현재 리비전의 실제 파일, Pi 공식 문서, 런타임 state, 테스트 결과에 근거합니다. 남은 불확실성은 실제 TUI 렌더링과 nested AgentSession guard 적용 여부의 런타임 화면 검증입니다. 이 불확실성은 결론의 방향을 바꿀 가능성이 낮지만, UI 수정 전에는 별도 dogfood 검증이 필요합니다.
