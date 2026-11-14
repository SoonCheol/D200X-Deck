# D200X 편집기 — Codex 독립 소스 검증 결과 (2026-11-14)

> **출처:** 사용자가 Codex 데스크톱 앱의 독립 검증 답변을 채팅에 붙여 넣은 것. 본 기록은 원본 답변을 바탕으로 작성했으며, ChatGPT가 GitHub의 인용 소스를 다시 직접 열어 코드 근거를 대조했다. **Codex가 보고한 메모리상 재현과 Windows/D200X 실기 실행을 혼동하지 말 것.**
>
> 대상 저장소: `SoonCheol/D200X-Deck` · 대상 브랜치: `codex/streamdeck-761-clean-editor` · 검사 기준 SHA: [`5d55f008f08f6c0fc9bfebcd37522a56c7dee011`](https://github.com/SoonCheol/D200X-Deck/commit/5d55f008f08f6c0fc9bfebcd37522a56c7dee011) · ChatGPT 구현 기준 SHA: [`40d94409`](https://github.com/SoonCheol/D200X-Deck/commit/40d94409bc8bbe5c8602bcee20bdf29c7f8a83c4).
>
> **이 문서 작성 시 코드 수정·새 빌드·PR 병합 없음.** 진단 보고서만 등록. 이전 물리 버튼 페이지 이동 수정 자체는 이미 반영된 상태이며, 이번 검증에서 발견한 것은 **구형 페이지별 바인딩 마이그레이션의 별도 버그**다.

## 검사 환경과 근거 구분

- **Codex 보고:** 검사 당시 GitHub 대상 HEAD `5d55f008f08f6c0fc9bfebcd37522a56c7dee011`. 기준 `40d94409` 이후 추가 커밋은 검증 대상 실행 코드를 수정하지 않았다고 보고.
- **Codex 보고:** `E:\Codex\D200X-HomeAssistant`는 Git 저장소가 아니며 `E:\Codex\D200X-Deck-git`는 대상과 다른 브랜치였으므로 GitHub 대상 커밋을 직접 검사. 이 경로를 임의로 이동·수정하거나 현 로컬 루트로 간주하지 말 것.
- **ChatGPT 재대조:** GitHub `5d55f008f08f6c0fc9bfebcd37522a56c7dee011`의 `editor.js`, `deck-core.js`, `preload.cjs`, `main.cjs`, 테스트 및 인수인계·계획 문서의 해당 내용을 직접 조회. 다음 항목의 **코드 존재는 확인**하되 Windows GUI/물리 하드웨어 실행 테스트를 새로 수행하지 않았음.
- **GitHub Actions 재확인:** [Node CI #43573025159](https://github.com/SoonCheol/D200X-Deck/actions/runs/43573025159) 성공, [Windows x64 Preview #43573021997](https://github.com/SoonCheol/D200X-Deck/actions/runs/43573021997) 성공 및 artifact `D200X-StreamDeck-Device-Sync-win-x64` 존재. **빌드 성공≠Windows 프로그램 실제 조작/하드웨어 기능 정상.**

## 8개 기능별 Codex 판정과 소스 근거

| # | 검사 항목 | Codex 판정 | 코드 근거·검증 한계 |
|---|---|---|---|
| 1 | 노브 변화량 1·2·5·10 선택 | **구현 확인** | [선택 UI](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L417-L423), [단계·범위 적용](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L211-L215) |
| 2 | 좌/우 회전 방향 반전 | **구현 확인** | [방향 반전 체크](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L424-L427), [방향 계산](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L211-L215) |
| 3 | 좌/우 변화량 미리보기 | **구현 확인** | [부호/수치 표시](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L429-L437) |
| 4 | 저장 및 프로그램 재실행 복원 | **코드 구현 확인, 실행 미검증** | [localStorage 읽기/쓰기](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L20-L22), [변화량·반전 기본값 정규화](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L82-L83). 실제 EXE 재실행 복원은 미실시 |
| 5 | 구형 설정 이관·기본값 | **버그 발견** | `step=1`, `reverseDirection=false` 기본값은 유지. 단, 구형 페이지별 물리 컨트롤 설정이 [전역 스코프 초기값/기존 데이터 이관](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L129-L155)의 충돌로 무시될 수 있음 |
| 6 | 페이지 이동 변화량·반전·경계 | **코드 구현 확인** | [페이지 번호 범위 계산](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L211-L215), [페이지 갱신](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L658-L662). **5번 마이그레이션 버그가 구 설정에 영향 가능** |
| 7 | Windows 음량·확대/축소 입력 횟수 | **코드 구현 확인, Windows 실행 미검증** | [실행/IPC 요청](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L649-L654), [count allowlist·키 입력 생성](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/main.cjs#L91-L119), [preload 브리지](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/preload.cjs#L4-L10). Windows에서 실제 효과 미확인 |
| 8 | 기존 24개 액션·물리 할당 보존 | **부분 구현** | [기존 액션 ID](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L9-L26) 및 입력 할당 모델 존재. [미지원 실행 반환](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L238-L250) 남음. 5번 문제 영향 가능 |

**판정 해석:** 위 `구현 확인`은 UI·모델·실행 계획 코드 경로 존재라는 뜻. **실기 정상이라는 의미 아님.** Codex는 전체 24개 액션 실행기가 완성된 것으로 보고하지 않았다.

## 발견 결함 및 리스크 — 수정 전 상태

### [높음] C1: 이전 형식의 페이지별 물리 버튼·노브 할당이 무시될 수 있음

- 근거: [`deck-core.js` 129~155행](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L129-L155). `controls` 없는 과거 설정에서 `state.pages[p][14+i]`를 `controls.pages[p][i].down`에 복사하지만, `emptyControls` 초기 `scopes`는 모두 `global`이다. 실행 시 `controlBinding`은 전역 할당을 우선 반환([94~99행](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/deck-core.js#L94-L99)).
- **Codex 보고의 재현:** 구 설정의 첫 페이지 물리 버튼=`next`, 둘째 페이지=`previous`이면, 이관 후 둘째 페이지에서도 전역 `next`가 실행되어 마지막 페이지에서 더 움직이지 않는다. *Codex의 메모리상 재현 보고이며 여기서 재실행하지 않음.*
- 최소 수정 **제안(미실행):** 구 설정에서 페이지마다 서로 다른 물리 할당이 있는 경우 해당 컨트롤의 `scopes`를 `page`로 유지할지 결정하고 기존 데이터 손실 없이 마이그레이션. 구형 상태→여러 페이지 전환→재시작 시나리오 테스트를 추가. 기존 전역 노브 이전/다음 동작이 회귀되지 않게 확인.
- **중요:** 이전 페이지 이동 버그에 대한 입력 디바운스·페이지 전환 초기화는 **이미 코드로 수정됨**. 본 항목만을 별도 레거시 이관 결함으로 다루며 '페이지 이동 수정 전부 미착수'로 표현 금지.

### [중간] C2: 저장 실패가 사용자에게 표시되지 않음

- 근거: [`editor.js` 20~22행](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L20-L22)의 `persist` 함수에서 `localStorage.setItem` 예외를 빈 `catch`로 무시함.
- 영향: 저장 실패 시 UI는 바뀐 것으로 보이지만 프로그램 재실행 후 이전 값으로 돌아갈 위험.
- 최소 수정 **제안(미실행):** 기존 UI를 크게 변경하지 않고 저장 실패 상태/오류 메시지를 노출. 저장 실패 주입·복구 흐름의 최소 회귀 테스트.

### [위험·실기 미확인] R1: 빠른 연속 회전의 입력 지연·순서 위험

- 근거: [`editor.js` 649~654행](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/editor.js#L649-L654)이 회전마다 비동기 호출하고, [`main.cjs` 116~119행](https://github.com/SoonCheol/D200X-Deck/blob/5d55f008f08f6c0fc9bfebcd37522a56c7dee011/app/streamdeck-editor/main.cjs#L116-L119)이 별도 `powershell.exe` 실행을 호출. 호출 간 직렬화 보장 코드 없음.
- 영향은 **가능성**이지 확인된 버그가 아님. 실제 키 입력 누락·역전 여부를 Windows + 물리 D200X 빠른 연속 회전에서 확인한 후, 재현될 때만 요청 큐/직렬화 등 국소 개선.

## 현재 개발 단계에 미치는 영향과 다음 Codex 인계

1. **현재 결과 기록만 완료.** C1/C2/R1의 코드 수정, 새 빌드 및 실기 검증은 수행되지 않았음.
2. P0-A 노브 단계량/반전은 **코드 구현 + CI + Windows 패키징 성공**. Windows 음량/활성 앱 확대 실제 동작·저장 재실행·하드웨어 연속 회전은 미검증.
3. 기존 P0-D 물리 버튼 페이지 이동의 **코드 보정은 완료**, 장치 검증 대기. C1은 구형 데이터 이관에 국한된 별도 결함으로 추적.
4. **C1(높음) / C2(중간)**은 다음 국소 수정 후보. 무엇부터 수정할지는 사용자 지시에 따르고, 현재 저장된 사용자 설정과 기존 24개·UI·USB 유지통신을 보호한다.
5. P0-B 버튼·노브 공통 액션 엔진 및 P0-C 8개 우선 기능은 계획대로 미완료. 새 PR 병합 없이 기존 Draft PR #5에서 협업.
6. 다음 빌드가 실제로 생성되면 GitHub Actions 성공 + artifact 업로드 확인 후 **그 빌드의 실행 링크**를 사용자에게 전달.

## 관련 원문/참고

- 독립 검증 결과: **2026-11-14 사용자 제공 Codex 답변**(8개 표 항목, 결함 C1/C2, 연속 회전 위험 R1 포함). 새 세션에서 검색 가능한 원격 정식 기록이 이 문서.
- [완전 인수인계](D200X-COMPLETE-HANDOFF-20261114.md) · [기본 액션 확장 계획](D200X-BUILTIN-ACTIONS-EXPANSION.md) · [전체 로드맵](D200X-STREAMDECK-ROADMAP.md) · [Draft PR #5](https://github.com/SoonCheol/D200X-Deck/pull/5).
