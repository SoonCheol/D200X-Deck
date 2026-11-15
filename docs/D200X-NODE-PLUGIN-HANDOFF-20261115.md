# D200X Stream Deck SDK Node.js 호환성 — 2026-11-15 전용 인수인계

> **이 문서를 다음 채팅/작업의 첫 진입점으로 사용한다.** 최신 상태를 판단할 때 `docs/D200X-CURRENT-STATUS.md`와 실제 최신 개발 브랜치 소스를 함께 확인한다. 과거 계획의 'Node 미구현' 문구는 날짜별 이력이다.

## 절대 변경하지 말 것

- GitHub: `SoonCheol/D200X-Deck`; 유일한 개발 브랜치 `codex/streamdeck-761-clean-editor`. `main` 수정·PR 병합 금지.
- D200X 사용자 프로필·기존 HTML Home Assistant SDK 플러그인·24개 기본 액션·노브/와이드 UI·기존 설치한 플러그인 데이터 무손실 보존.
- Fusion 전용 로직/하드코딩 금지. **Elgato 공식 SDK를 따르는 범용 실행 호스트**를 만든다.
- Virtual Stream Deck 개발 보류.
- 사용자 개입 최소화. PC 종료 상태에서도 가능한 GitHub 코드·CI·Windows 빌드까지 작업. 실제 Windows GUI/Fusion/Python 애드인/D200X 실기는 별도이며 거짓 완료 금지.
- 장황한 중간 채팅 메시지 금지. 코드/CI/제약·실패·다음 행동을 GitHub 커밋과 이 문서에 적시하여 대화창이 종료돼도 이어갈 수 있게 한다.

## 공식 및 공개 참조

- Elgato 공식 SDK: https://github.com/elgatosf/streamdeck
- 대체 호스트 실행 구조(직접 코드 복제 없이 참고): https://github.com/nekename/OpenDeck (`src-tauri/src/plugins/mod.rs` 및 `webserver.rs`, GPL-3.0).
- Electron/JavaScript 참고: https://github.com/moeilijk/DeckBridge (`src/core/plugins/PluginManager.ts` 및 `websocket/PluginServer.ts`).
- 첫 목표: https://github.com/AutodeskFusion360/FusionStreamDeck (`streamdeck_plugin/com.autodesk.fusionstreamdeck.sdPlugin/manifest.json`, `CodePath: bin/plugin.js`, `Nodejs.Version:24`, `SDKVersion:2`, `PropertyInspectorPath: ui/run-command.html`).
- Electron 45는 Node 24를 포함하며 `ELECTRON_RUN_AS_NODE=1`은 기본 runAsNode 퓨즈가 켜진 경우 Electron 실행 파일을 Node로 실행한다. **Windows 패키징 이후 실제 런타임 검증해야 함**.

## 3차 Workflow 오류와 수정 기록

- 커밋 `ff8dfc44940709114745dfc5d5d28565185ff0b2`: 첫 Windows Node24 패키징 검증 step이 잘못 생성되면서 YAML 문자열 구성이 깨져 Actions [#43688432536](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688432536)이 **워크플로 구문 오류/잡 미생성으로 실패**. 앱 코드 실행 실패가 아님.
- 이 커밋은 **workflow 파일의 깨진 step만 복구**하고 정규식 대신 단순 숫자 파싱으로 검사를 변경. CI 및 패키징 실행 결과가 확인되기 전까지 성공 표시 금지.

## 코드·검증 이력 (사실만)

| 단계 | 커밋/Actions | 실제 작업 및 증거 |
|---|---|---|
| Node 호스트 초기 | `0499bf2164a65af10ea5524a1fd01c5434993861` | `sd-plugin-host.cjs`: HTML 및 JS/MJS/CJS manifest 허용; 설치 시 자동 실행 금지; `ensure` 단계에서 Node 런타임 버전 확인, 별도 프로세스 실행, 원본 SDK CLI 인수, 기존 WS 등록·키·상태 경로 재사용; 종료 처리 |
| 초기 CI | [CI #43687825178](https://github.com/SoonCheol/D200X-Deck/actions/runs/43687825178) | success |
| 초기 Windows | [Preview #43687820764](https://github.com/SoonCheol/D200X-Deck/actions/runs/43687820764) | success. 물리 D200X/실행 증거는 아님 |
| 플러그인 폴더 & 실통신 | `f7207e8fe5a03fbe4704cc30cac8b274dcb18ab2` | `.sdPlugin` 폴더 설치 전용 버튼+IPC+ZIP 검증 재사용; localhost 구성을 127.0.0.1로 명시; 테스트 프로세스 실행 후 원본 SDK WebSocket 등록 및 `keyDown→setTitle` 자동 통합 테스트 |
| 2차 CI | [CI #43688058250](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688058250), [입력 #43688053891](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688053891) | 모두 success |
| 2차 Windows | [Preview #43688053882](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688053882) | success; Artifact `14151515746`, 170,372,386 bytes, 확인 당시 미만료 |
| 3차 | 현재 개발 중 | Windows 패키지 `ELECTRON_RUN_AS_NODE` Node24 검증과 실행 프로세스 재동기화 내구성 보완; 결과를 다음 커밋에 기록할 것 |

## 현재 구현 연결부

- `app/streamdeck-editor/sd-plugin-host.cjs` — manifest·설치·Node/HTML 실행 분기·WS·원본 PI·D200X 이벤트. Electron 내장 Node 24 사용 시 PC에 별도 Node 설치 불필요하게 설계. `D200X_NODE_PATH` 환경변수로 별도 Node 실행 파일 지정 가능.
- `app/streamdeck-editor/main.cjs` — 사용자 요청에 따라 ZIP/streamDeckPlugin 설치와 개발자 `.sdPlugin` 폴더 설치 IPC.
- `app/streamdeck-editor/preload.cjs` — 등록된 UI→Main 브리지 메서드.
- `app/streamdeck-editor/editor.js` — 플러그인 탭·액션 목록·설치 버튼·드래그 등록·원본 속성창·SDK 상태 그림 갱신.
- `test/streamdeck-sdk-host.test.cjs` — 기존 HTML/HA 테스트 + Node manifest/ZIP/런타임 검증 + 실제 Node 프로세스 WebSocket keyDown 통합 + 폴더 설치 테스트.
- `.github/workflows/streamdeck-clean-preview.yml` — 브랜치 소스 변경 시 Windows 테스트/EXE/ZIP 자동 생성, 문서-only 커밋은 건너뜀.

## 남은 작업과 판정 제약

1. **이번 Windows 패키지 Node24 연동 검사:** 추가되는 CI 검사가 실제 성공했는지 실행 URL과 소스 SHA를 기록한다. 실패 시 직접 오류 보고·수정하며 성공을 추측하지 않는다.
2. **실제 Autodesk Fusion 플러그인 원본 등록·설정창 확인:** 사용자 PC/Fusion 애드인을 실행하지 못하므로 최종 실기는 미완료. 소스에서 `lib/streamdeck.js`의 `ws://127.0.0.1:<port>`, `willAppear`, `keyDown`, `sendToPlugin`, `setImage` 등 계약을 확인했으며 현재 SDK 호스트와 연결 경로가 존재함.
3. **Fusion Python 애드인:** `%APPDATA%\\Autodesk\\Autodesk Fusion 360\\API\\AddIns\\FusionStreamDeck` 아래 설치·실행 필요; 로컬 브리지 `127.0.0.1`. Node 플러그인만 실행하면 실제 Fusion 명령이 실행된다고 주장하지 말 것.
4. **일반적 플러그인 호환성:** Node·HTML 외 네이티브/DRM·마켓플레이스/다중 동작 SDK 하위 실행 지원은 별도 과제. 모든 Stream Deck 플러그인 100% 호환을 약속하지 않는다.
5. **보안:** 기존 폴더 입력/ZIP 크기·경로·링크 검사 유지. 명시적 사용자가 설치·배치한 플러그인만 실행한다. 외부 GitHub 소스를 직접 복사할 때 라이선스 검증 및 적절한 저작권 표시 필요.
6. **실기 시나리오:** Fusion 360 → Python 애드인 실행 → 개발자 `.sdPlugin` 폴더 설치 → D200X 플러그인 탭 Run Command 배치 → Property Inspector에서 `extrude` 검색·설정 → D200X 물리 버튼 → Fusion 명령/아이콘·오프라인 복귀. 실제 수행하지 않고 통과 표시 금지.

## 다음 세션 시작 방법

개발 브랜치 HEAD 확인 → `AGENTS.md`와 `docs/D200X-CURRENT-STATUS.md`, 본 파일 열기 → `sd-plugin-host.cjs`, 기존 테스트·Windows Workflow 읽기 → 최근 Actions의 정확한 status/conclusion 확인 → 남은 구현만 코드 수정 → 테스트 결과를 문서/커밋에 남기기. 사용자에게 작업 재설명 요구하지 않는다.
