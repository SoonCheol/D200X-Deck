# Stream Deck 7.6.1 → D200X Windows 편집기 기능 차이 분석

- 조사일: 2026-11-13 (Asia/Seoul)
- 구현 기준: `windows-port` 커밋 `beda4d82c75e4762b75d56c9ed38f9f2987c1afd`
- 비교 근거: [REA/GUI 자료 PR #1](https://github.com/SoonCheol/D200X-Deck/pull/1) 커밋 `a24d56f10339e1ced1216223344edf768de3c01e`
- 최종 목표: Elgato Stream Deck 7.6.1의 UI·메뉴·액션·플러그인 사용 경험을 최대한 재현한 **Windows용 Ulanzi D200X 전용 편집기**. D200X 통신만 기존 Ulanzi Deck Open/OpenDeck 구현 참고.
- 방법: GitHub 소스 및 보존된 분석 보고서의 **정적 대조**. 이번 조사에서 REA/Ghidra 실행, Windows 앱 실행, D200X 실기 테스트 또는 빌드는 하지 않았다.
- 기준 주의: REA Evidence ID는 보고서에 보존된 식별자이며 Ghidra Evidence 원본은 현재 재조회할 수 없다. 정적 코드의 존재를 작동 성공으로 해석하지 않는다.

## 요약

`windows-port`는 기본 Electron 편집기와 Windows 관련 보강이 이미 존재한다. 메뉴/프로필/액션 편집/플러그인 호스트를 새로 만드는 대신 **화면 배치와 액션/설정 모델의 Stream Deck 충실도**를 먼저 높인다. D200X 장치의 실제 VID/PID와 HID 호환 여부는 검증되지 않았다.

## 확인된 구현과 차이

| 대상 | 현재 소스에서 확인된 내용 | Stream Deck 7.6.1 관찰/분석과의 차이 | 판정 |
|---|---|---|---|
| 기본 편집기 레이아웃 | `app/renderer/styles.css`의 `#app`은 sidebar / center / inspector 3열 그리드; `index.html`의 페이지 목록과 액션 라이브러리는 왼쪽, `#inspector`는 오른쪽 | 보존된 7.6.1 UI 관찰은 가운데 3×5 키 캔버스·오른쪽 액션/플러그인 영역·하단 선택 액션 속성 영역 | **레이아웃 재구성 필요** |
| 액션 목록 | `app/renderer/action-catalog.js`가 한글 그룹, 검색, 클릭 배정, HTML drag 이벤트를 구현 | 7.6.1에서 관찰된 24개 키 액션과 범주·아이콘·상세 동작이 일치한다는 근거 없음. 일부 기능은 현재 목록에 별도 항목이 없음 | **액션 대조 필요** |
| 선택 키의 속성 | `app/renderer/app.js`와 `inspector.js`를 통해 기존 속성 편집기 연동; 액션 라이브러리가 변경 이벤트로 연동 | Stream Deck 7.6.1의 액션별 Property Inspector 위치/옵션과 동일하지 않음. 타이머 이외 다수 실제 관찰 없음 | **상세 매트릭스 보강** |
| 페이지·프로필 | `index.html`에 프로필 선택/메뉴 및 `#page-list`; 기존 앱의 프로필·페이지 코드 | 7.6.1의 우클릭·프로필 설정·폴더 메뉴 전체와 일치 여부 확인되지 않음 | **기능 비교 우선** |
| 물리 컨트롤 | `physical-controls.js`에서 측면 2개(15/16), 노브 3개(17~19)의 회전/누름 설정 및 처리 코드를 정의 | 실제 D200X HID 보고서 번호·이벤트/방향과 일치하는지 미검증; GUI의 Stream Deck 인코더/터치 UI 대응도 미확인 | **실기 확인 필요** |
| 장치 검색 | `app/lib/deck.js`의 VID `0x2207`, PID `0x0019`, interface 0, `node-hid` 경로 | 기존 Ulanzi D200 대상 코드이다. 사용 중인 D200X와 동일한 장치 식별값/프로토콜인지 불명 | **실기 최우선 검증** |
| Windows 입력 | `app/lib/actions.js`, `windows-input.ps1`, `windows-apps.js` 및 `app/ipc.js`에서 Windows hotkey/media/text/app 열거와 실행 경로 존재 | 단위/스모크 테스트 설정이 있어도 D200X 실제 키 입력과의 연결 성공을 증명하지 않음 | **실행 시험 필요** |
| 플러그인 검색 | `app/lib/plugin-dirs.js`가 Windows APPDATA의 OpenDeck/Elgato 폴더를 다룸 | REA의 두 Stream Deck 플러그인 로딩 경로와 정확히 동등한지는 미검증 | **대조 후 필요한 부분만 수정** |
| Manifest/플러그인 실행 | `app/lib/streamdeck-plugins.js`에서 `.sdPlugin`, `manifest.json`, `Actions`, `PropertyInspectorPath`, Windows CodePaths와 포트/UUID/등록 인수 처리, `PluginHost` WebSocket 연계 확인 | 전체 SDK 이벤트 호환, 유효성 검사/기본값, 특정 플러그인 실행 성공은 미확인. 기존 구현이 있으므로 재작성은 불필요 | **표적 호환성 테스트** |
| 한국어 | `app/renderer/ko.js`에 한국어 문자열 매핑 존재 | 원본 GUI와 레이아웃/상호작용 동일성은 별개의 과제 | **유지** |
| Windows 패키징 | `.github/workflows/windows-preview.yml`에 Windows x64 프리뷰 생성 및 JS/PowerShell 검사 | 빌드 워크플로 존재만 확인. 이 조사에서 빌드 상태/실기 실행은 검증하지 않음 | **후속 검증** |

## 근거 및 확인 범위

- [REA 함수 분석](https://github.com/SoonCheol/D200X-Deck/blob/a24d56f10339e1ced1216223344edf768de3c01e/research/streamdeck/7.6.1/cli/StreamDeck_REA_7.6.1_Analysis.md): 메인 창 `0x140150040`, 트레이 메뉴 `0x1401dcd40`/`0x1401dd670`, .sdPlugin 검색 `0x140409ea0`/`0x14040a0c0`, manifest `0x1404540f0`, 액션 순회 `0x14040b8b0`. 해당 보고서의 분석 결과는 실제 런타임 검증을 대신하지 않는다.
- [실제 UI 관찰](https://github.com/SoonCheol/D200X-Deck/blob/a24d56f10339e1ced1216223344edf768de3c01e/research/streamdeck/7.6.1/desktop/02-ui-layout.md), [액션 목록](https://github.com/SoonCheol/D200X-Deck/blob/a24d56f10339e1ced1216223344edf768de3c01e/research/streamdeck/7.6.1/desktop/04-action-inventory.md), [메뉴](https://github.com/SoonCheol/D200X-Deck/blob/a24d56f10339e1ced1216223344edf768de3c01e/research/streamdeck/7.6.1/desktop/03-menu-inventory.md). 각 문서의 '설치 후 관찰'과 '초기 조사/공식 문서'는 서로 다른 시점이므로 혼동하지 않는다.
- [Windows 편집 HTML](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/renderer/index.html), [레이아웃 CSS](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/renderer/styles.css), [액션 라이브러리](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/renderer/action-catalog.js), [물리 컨트롤](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/renderer/physical-controls.js).
- [HID](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/lib/deck.js), [플러그인 디렉터리](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/lib/plugin-dirs.js), [플러그인 호스트](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/app/lib/streamdeck-plugins.js), [Windows 프리뷰](https://github.com/SoonCheol/D200X-Deck/blob/windows-port/.github/workflows/windows-preview.yml).

## 순서가 있는 다음 개발 작업 (Codex는 구현 및 실기 지원, ChatGPT는 기준/검토 담당)

### P0 — 하드웨어 연결의 진위 먼저 확인

1. 현재 PC에 연결된 실제 D200X의 VID/PID, 인터페이스 및 보고서 번호를 **읽기 전용**으로 수집한다.
2. `app/lib/deck.js`의 `0x2207:0x0019`와 대조한다.
3. 다르면 무조건 VID/PID만 바꾸지 말고 프로토콜, 프레임, 키/노브 이벤트 차이를 기존 Ulanzi Deck Open/OpenDeck 자료와 대조한다.
4. 장치 설정 변경·기존 Studio 종료·USB 독점 연결은 사용자가 승인한 테스트에서만 실시한다.
5. 완료 기준: 실제 D200X 연결 상태를 증거로 기록하고, 최소 1개 일반 버튼·측면 버튼·노브 회전/누름 이벤트를 식별한다. 결과를 GitHub 문서에 반영한다.

### P1 — 화면 골격을 Stream Deck 방식으로 재배치

1. 기존 `index.html`/`styles.css` 및 액션/속성 상태 로직을 재사용한다.
2. 가운데 3×5 캔버스, 오른쪽 액션 목록, 아래쪽 선택 액션 속성 편집기를 Stream Deck 7.6.1 설치 후 관찰 자료에 맞춘다. 실제 D200X 버튼 구성/와이드 영역은 별도 적응 설계로 표현한다.
3. 우선 프로필 선택, 키 선택, 액션 클릭/드래그, 하단 속성 갱신, 페이지 전환/추가가 끊기지 않게 만든다.
4. 완료 기준: 기존 설정·액션 타입·저장 형식을 임의 변경하지 않으며, 동일 기능에 회귀 없이 화면 골격이 재현된다.

### P2 — 메뉴와 기본 액션 갭 메우기

1. 보존된 7.6.1의 기본 동작 24개와 현재 액션 카탈로그를 **이름/기능/설정 UI/실행 조건**별로 매핑한다. 단순 이름 일치와 실제 기능 동등성을 구분한다.
2. 빈 키/할당 키의 두 우클릭 메뉴, 타이머 배치→편집→삭제 흐름을 먼저 재현한다.
3. 미확인 기능은 공식 자료 또는 GUI 직접 관찰로 확인하고, 불가한 경우에만 REA 범위를 한정하여 요청한다.

### P3 — 기존 플러그인 호스트 호환 검증

1. 이미 존재하는 `streamdeck-plugins.js` 및 `plugin-host.js`를 재사용한다. 불필요한 전면 교체 금지.
2. 설치→Manifest→실행→WebSocket 등록→Key 이벤트→Property Inspector→설정 저장→상태/아이콘 갱신의 실제 흐름으로 테스트한다.
3. 플러그인과 장치 호환은 별도 판정. Ulanzi Studio 전용 HA 플러그인을 Stream Deck 호환 플러그인으로 가정하지 않는다.

## REA 재실행 판정

**현 시점에서는 하지 않는다.** 기존 보고서에 플러그인 검색·등록과 메인/트레이 메뉴 함수가 있다. 공식 SDK 및 오픈소스 구현, 7.6.1 GUI 직접 관찰로 풀 수 없는 **구체적인 누락 동작**이 발생할 때만 대상 함수·질문·기대 산출물을 먼저 고정하고 표적 REA 작업을 결정한다.

## 보호 규칙

- 이 문서는 정적 조사 결과이다. 구현 완료, 빌드 성공, 실기 작동을 주장하지 않는다.
- `windows-port`, `main`, PR #1 분석 원본 및 기존 소스를 수정하지 않는다.
- 비밀정보, 로컬 사용자 경로, Stream Deck 바이너리, 원시 Ghidra 산출물은 공개 문서에 포함하지 않는다.
