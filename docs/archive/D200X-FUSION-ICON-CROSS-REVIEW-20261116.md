# D200X-Deck Fusion 아이콘 오류 — ChatGPT × Gemini 교차 검증 및 인수인계 (2026-11-16)

> **상태: 읽기 전용 분석 완료 / 수정·테스트·빌드 미실행.** 다음 채팅에서 이 문서와 `AGENTS.md`, `docs/D200X-CURRENT-STATUS.md`, `docs/D200X-STREAMDECK-ROADMAP.md`, `docs/D200X-COMPLETE-HANDOFF-20261114.md`를 먼저 확인할 것. 실제 구현 여부는 최신 HEAD의 소스가 우선한다.
>
> 저장소: `SoonCheol/D200X-Deck`; **유일한 개발 브랜치**: `codex/streamdeck-761-clean-editor`; 분석 HEAD: `0c5cada7eadecfb20adf2605fbdb90c426bed3a0`. PR #5는 분석 시 Open/Draft/미병합. 다른 브랜치 생성·전환, PR 병합 금지. **사용자의 별도 명시 지시 전 코드 수정·커밋·빌드 금지**(본 인수인계 문서 작성 자체는 사용자 승인됨).

## 1. 문제와 검토 범위

사용자 실기 관찰: Fusion Command Manager에서 명령을 DeckForge 일반 버튼으로 드래그하면 **명령 제목은 맞으나 아이콘이 간헐적으로 다른 Fusion 명령 이미지로 표시**됨. 화면 표시 오류와 명령 실행 오류 및 디스크 아이콘 캐시 오염은 **서로 다른 결과**이므로 따로 검증할 것.

근거:
- Gemini 1차 정밀 보고서(대화 첨부 텍스트, 244줄) 및 Gemini 2차 재검토 보고서(대화 첨부 Markdown, 298줄).
- ChatGPT가 GitHub 커넥터로 직접 읽어 대조한 파일: `app/streamdeck-editor/sd-plugin-host.cjs`, `editor.js`, `fusion-drag.cjs`, `main.cjs`, `bundled-integration.cjs`, `tools/fusion-manager/main.cjs`, `renderer.js` 및 프로젝트 관리 문서 4개.
- **출처 구분:** 아래 '코드 확인'은 ChatGPT가 위 소스에서 직접 확인한 범위. Autodesk 업스트림 `bin/plugin.js`, `icons.py`, `server.py` 등의 세부 구현은 **Gemini가 조회했다고 보고한 내용**이며 이 문서 작성 시 ChatGPT가 독립적으로 업스트림 원문을 재검증한 사실은 없음. 실제 수정 전 원본과 고정 SHA `bc153b8cddedba91614f932f4210f1ecb451c2a8` 대조 권장. 행 번호는 **분석 HEAD 기준**, 이후 달라질 수 있음.

## 2. 실제 코드로 확인한 결함·위험 경로

| 구분 | 판정 | 근거 (HEAD 기준) | 의미 |
|---|---|---|---|
| 동일 슬롯 설정 변경 미전달 | **코드 확인** | `sd-plugin-host.cjs sync()` 278–307: 같은 context/pluginUUID/actionUUID이면 `ctx.settings`만 갱신. 별도 `didReceiveSettings` 없음 | A→B가 동일 Fusion actionUUID일 때 플러그인 내부 A 설정 잔존 가능 |
| 슬롯 교체 화면 상태 미정리 | **코드 확인** | `editor.js setItem()` 284–297: 등록 교체 후 `persist(); render()`만. `sdkVisuals`·Fusion live/offline 집합 정리 없음 | B의 아이콘이 아직 없으면 A의 이미지가 B 자리에 노출될 수 있음 |
| 실시간/캐시 우선순위 역전 | **코드 확인** | `editor.js importFusionDraggedCommand()` 448–471, 특히 468: PNG를 `action.icon`에 고정. `displayItem()` 223–240: `item.icon`이 `runtimeImage`보다 우선 | 자동 수집 PNG가 새 실시간 아이콘을 가림; PNG 미포함 경우에는 잔존 `visual.image`가 캐시보다 우선할 수 있음 |
| setImage 캐시 오염 경로 | **코드상 위험 확인, 실기 빈도 미검증** | `editor.js` 3461–3489: 현재 context로 현재 commandId를 조회해 `rememberFusionIcon(id,old.image)`; 3465–3471에서 새 이미지가 유효하지 않아도 과거 `old.image`를 이용할 수 있음 | A 응답이 B 교체 후 도착하면 B용 디스크 PNG를 A 이미지로 쓸 위험. 실제 발생 여부/빈도는 별도 재현 |
| SVG 드래그 누락 | **코드 확인** | `fusion-drag.cjs` 13–25는 PNG Data URI만 encode/decode. `tools/fusion-manager/renderer.js` 297–303은 `iconCache.get(id)` 전달 | 수집 SVG 및 아직 미수집 이미지가 payload에서 제외됨(이름/ID는 보존) |
| 캐시 miss 영구화 | **코드 확인** | `editor.js requestFusionIcon()` 152–160: `fusionCacheMisses.has(id)`면 재조회하지 않음 | 추후 파일이 생성돼도 앱 세션에서 읽지 못할 수 있음 |
| 캐시 경로 불일치 | **코드 확인** | DeckForge `main.cjs` 50–59는 `fusion-command-icons/<id>.png`만 조회; Manager `main.cjs` 41–53은 자기 `original-fusion-icons` 우선, DeckForge 캐시를 fallback | 정상 원본/오염 가능 캐시 사이 표시 불일치. Manager가 오염 캐시를 재전파할 수도 있음 |
| 창 종료 생명주기 | **코드 확인** | Manager `main.cjs` 178–181: standalone 분기 밖에서 `window-all-closed → app.quit()` 등록 | 통합 require 시 DeckForge 트레이 정책과 충돌 위험 |
| 고정 키 미리보기 | **코드 확인** | `editor.js refreshSelectedVisual()` 1260–1266: `currentPage()[selected] !== item` 비교 | 페이지 슬롯이 비고 pinned 액션으로 표시될 때 미리보기 중단 위험 |
| dirty 인스펙터 중 외부 드롭 | **코드상 위험, 시나리오 재현 필요** | `editor.js persist()` 95–99가 dirty 동안 디스크 저장 대신 세션 보류; 외부 드롭은 `setItem()` 사용 | 기존 편집 취소 시 외부 드롭까지 되돌아갈 가능성 |

**중요:** 최초 Gemini의 '100% 확인'은 대부분 **정적 코드 경로에 관한 판정**으로만 인정한다. Windows 실제 드래그 타이밍, A가 실제 실행되는지, B.png 오염 빈도, HA/트레이 회귀까지 실기 확인한 것으로 해석하지 않는다.

## 3. Gemini 2차 보고서에서 보완된 견해

1. **동일 인스턴스 설정 변경과 슬롯 액션 교체를 구분.** 모든 설정 변경에 무조건 `willDisappear → willAppear`를 보내는 초기 제안은 철회. 같은 액션 인스턴스의 설정 편집은 변경 시 `didReceiveSettings`; 교체는 구/신 인스턴스의 다른 context를 사용하여 SDK 생명주기 분리. 현재 PI `setSettings` 경로가 이미 `didReceiveSettings`를 전송하므로 중복 통지 방지.
2. **외부 SDK setImage에는 commandId/세대 정보가 없다는 제약.** 단순 타이머·renderer 내부 generation만으로 이전 명령의 지연 이미지를 신뢰성 있게 구별할 수 없음. 교체에는 인스턴스별 고유 context를 사용해 오래된 context를 무효화하는 방향 제안.
3. **같은 context에서 PI가 commandId를 바꾸는 경우는 별도 문제.** 귀속 불확실 setImage는 디스크 캐시에 저장하지 말고, Fusion 아이콘 API를 명령 ID와 함께 조회한 경우에만 검증된 이미지로 기록하는 방안.
4. **자동 아이콘과 사용자 지정 아이콘 분리.** 새 드래그 PNG/SVG는 `action.icon`에 저장하지 않고 명령 ID 기반 캐시 사용. 기존 프로필에 이미 `action.icon`으로 저장된 이미지는 사용자 데이터 보존을 위해 자동 일괄 이관·삭제하지 않음.
5. Gemini는 업스트림 `icons.py`에서 **SVG 우선 선택**, `plugin.js`에서 비동기 `refreshIcon` 완료 후 동일 명령 재검증 부재를 확인했다고 보고함. 이 구체적 업스트림 주장은 **수정 전 독립 재확인 필요**.

## 4. 최소 수정 설계 (제안이며 승인/구현 아님)

**P0 — 직접 원인 차단**
- `editor.js`: 슬롯 교체/삭제(일반 버튼, pinned, 물리 버튼, 노브의 gesture 포함)에서 실제 이전 SDK **액션 인스턴스**에 귀속된 visual/live/offline 상태만 정리. 제목·일반 설정 변경에 불필요한 초기화 금지.
- `editor.js` / `sd-plugin-host.cjs`: 각 실제 SDK 액션 인스턴스에 일관된 context 식별자 사용. Gemini의 `WeakMap<item,token>`은 **후보**일 뿐 확정 구현안 아님: `sdkActionInstances()`, `displayItem()`, `pluginSlotContext()`, 하드웨어 입력, 렌더링 시 action **복제/정규화**, 프로필 전환·세션 재시작으로 객체 참조가 달라지는지 반드시 검증. 이 일관성이 확보되지 않으면 token을 임의 도입하지 말 것.
- `sd-plugin-host.cjs sync()`: 동일 context의 settings 변경 시 SDK 표준 `didReceiveSettings`를 중복 없이 보냄. HA `lastState` 재조회 조건도 관련 설정이 바뀐 경우에만 적절히 초기화.
- `onSdkEvent(setImage)`: **이번 수신 payload가 유효할 때만** 처리. 교체 전 구 context 이벤트는 호스트 및 렌더러에서 폐기. 현 context의 명령 출처를 검증할 수 없는 경우 **디스크 캐시 쓰기 금지**(잘못된 이미지로 확정 저장하지 않기). 비동기 `rememberFusionIcon` 완료 전 소유권 변동도 고려.
- 드래그한 원본 이미지는 `action.icon`이 아닌 `fusionIconCache` + 별도 저장에 보관. 신규 자동 아이콘의 우선순위는 **사용자 선택 아이콘 > 정상 실시간 SDK 이미지 > 명령 ID 원본 캐시 > 확인된 마지막 폴백**. 기존 프로필과 `sdkStateIcons`은 보존.

**P1 — 누락 및 재발 방지**
- SVG 안전한 수용/PNG 래스터화 중 한 경로로 구현; Data URI 크기·형식 검증 및 안전성 유지.
- `fusionCacheMisses`의 영구 실패를 재시도 가능한 형태로 변경(예: TTL/캐시 생성 때 무효화).
- `original-fusion-icons`와 `fusion-command-icons`의 실제 **통합 실행 시 app.getPath('userData') 경로**를 확인한 뒤 읽기 우선순위 설계. 서로 다른 userData로 저장될 수 있으므로 파일 경로 추측 금지.
- 이미 오염된 캐시 **일괄 삭제 금지**. 원본 아이콘 API `GET /icon?commandId=<id>`의 ID 결합 응답 등 신뢰 출처를 확인했을 때만 기존 파일과 비교해 최소 교체; Fusion 부재/404이면 사용자 캐시 보존. 단순 PNG/SVG 바이트 해시 차이는 포맷·래스터화 변동일 수도 있으므로 **불일치만으로 오염 확정 금지**.

**독립 후속(P1/P2)**
- Manager `window-all-closed` 리스너를 standalone 실행 조건 안으로 이동하는 설계 검토(트레이 동작 보존). 브라우저 창 sandbox/내비게이션 및 IPC `event.sender` 범위는 기존 기능과 preload IPC 호환 검토 후 별도 최소 수정.
- pinned 키 미리보기 비교는 `DeckCore.visibleActions(state)[state.selected]` 기준 검토.
- 인스펙터 dirty 상태의 외부 드롭 시 저장/취소 충돌을 재현해 무손실 처리.
- PowerShell 반복 실행·localStorage 용량·자석 DPI는 **별도 측정 후 판단**. 아이콘 P0 수정과 섞지 않음.

## 5. 검증 및 승인 기준

필요한 최소 자동 테스트(아직 미실행):
1. 동일 슬롯 명령 A→B 교체 시 구 SDK 컨텍스트 해제, 신 컨텍스트에 B 설정 전달, **기존 A setImage 차단**.
2. 기존 설정 편집 시 `didReceiveSettings` 정확히 1회(PI 변경 중복 방지), HA dual-state 상태 재조회.
3. 슬롯 교체 후 SDK visual이 잔존하지 않는지, **사용자 지정 아이콘·기존 JSON 호환 보존**, 실시간 > 자동 캐시 우선순위.
4. PNG/SVG 유효/무효 드래그 및 잘못된 setImage payload에 의한 캐시 덮어쓰기 차단.
5. cached miss 후 새 원본 생성/읽기, 프로필·페이지·gesture 전환, Manager 통합 종료 이벤트.
6. dirty 인스펙터 상태에서 외부 드롭 후 저장/취소 동작.

사용자 Windows/Fusion/D200X 실제 검증(원격 CI와 구별):
- SVG/PNG 명령을 빈 슬롯 및 A가 있던 슬롯으로 드래그; A→B→C 빠른 교체; 편집기/인스펙터/D200X 화면과 실제 명령 일치.
- 앱 재시작 시 명령 ID별 아이콘 유지 및 오염 파일 여부 확인. Fusion 종료/재실행 후 오프라인 이미지/X/실시간 복원.
- HA ON/OFF, 사용자 지정 이미지, 트레이 상주, 노브·측면 버튼·고정 키 회귀 확인.
- **CI 성공/Windows 설치 파일 생성은 실제 Fusion·D200X 실기 통과를 증명하지 않는다.**

## 6. 작업 재개 지침

1. 이 문서는 **분석 및 수정 제안 기록**이지 이미 구현됐다는 선언이 아님.
2. 다음 채팅에서 **현재 GitHub HEAD 확인 → 4개 고정 문서 및 본 문서 확인 → 사용자 승인에 따라** 필요한 코드 범위만 열 것. 이전 채팅 전체 재조사 금지.
3. Gemini/ChatGPT 견해가 다른 지점(인스턴스별 SDK context, PI의 동일-context 수정, 캐시 신뢰도)은 명확한 소스 근거와 테스트로 결정. **WeakMap 토큰 도입을 무조건 확정하지 말 것.**
4. UI 디자인, 현재 24개 액션, 플러그인, 프로필, HA 토큰, 사용자 아이콘, 기존 설치 데이터 보존. 불필요한 리팩터링/대규모 테스트 금지.
5. **사용자가 수정·커밋·빌드를 명시적으로 지시할 때만 실행.** PR #5 병합 금지.

## 7. 이번 문서 업로드의 범위

사용자 지시: '너가 분석비교한 내용을 깃헙에 남겨 대화창 끊어져도 이어질수있게'. 따라서 **이 Markdown 문서만 GitHub 지정 브랜치에 추가**. 앱 소스/테스트/워크플로/기존 상태 문서는 변경하지 않음. GitHub의 새 문서 커밋으로 HEAD가 변경되는 것은 의도된 문서 작업이며, 자동 빌드 여부는 워크플로 실제 트리거에 따름.
