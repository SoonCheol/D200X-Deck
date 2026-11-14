# D200X Stream Deck 편집기 — 대화창 간 완전 인수인계 (2026-11-14)

> **목적:** 새로운 ChatGPT 대화창과 Codex 세션이 기존 설계·결정·작업 상태·다운로드 제공 방식까지 누락 없이 이어받도록 하는 작업 기준. 이 문서는 이전 대화의 사용자 요구와 2026-11-14 GitHub 대조 결과를 정리한 것이다. 실제 동작을 새로 검증했다고 주장하지 않는다.
>
> **진행 저장소:** [SoonCheol/D200X-Deck](https://github.com/SoonCheol/D200X-Deck) / 브랜치 `codex/streamdeck-761-clean-editor` / Draft [PR #5](https://github.com/SoonCheol/D200X-Deck/pull/5). **임의 병합 금지.**

## 0. 새 세션 시작 시 즉시 해야 할 일

1. 이 문서 및 `AGENTS.md`, `docs/D200X-STREAMDECK-ROADMAP.md`, `docs/D200X-BUILTIN-ACTIONS-EXPANSION.md`를 읽는다.
2. GitHub 브랜치 HEAD와 최근 CI/Windows 빌드 기록을 **실제로 조회**한다. 2026-11-14 대조 시 HEAD는 `f951fb2d6b572aa2a13771e83026954a42fb7e4e`였으나 이후 변경 가능하다.
3. 우선 P0 액션 확장과 **페이지 이동 후 물리 버튼/노브가 한 번만 작동하거나 할당이 풀리는 현상**을 회귀 과제로 추적한다.
4. 기존 소스·기본 액션·사용자 저장 설정과 승인 UI를 보존하고, 요청한 기능만 국소 수정한다.
5. 기능을 구현하면 관련 최소 테스트 → CI → Windows 프리뷰 Actions 빌드 결과 확인 → GitHub 문서와 커밋 기록 업데이트 → **Windows ZIP/EXE를 내려받을 수 있는 정확한 GitHub Actions 실행 링크 제공** 순서로 처리한다.
6. 코드·CI 완료와 사용자의 **실물 D200X 검증**을 반드시 구분한다. PC 파일은 원격 GitHub 작업만으로 변경되었다고 표현하지 않는다.

## 1. 제품·기기·작업 범위

- **기준 UX/UI:** Elgato Stream Deck **7.6.1 (23033), 한국어 Windows**의 액션/속성창/컨트롤 흐름. 단, D200X 하드웨어 형상에 맞게 확장한다.
- **대상:** Ulanzi D200X — 화면키 **13개 + 와이드키 1개(하드웨어 0–13)**, 별도 **물리 버튼 2개(15,16)**, **회전 노브 3개(17,18,19)**. '측면 버튼'보다 사용자에게 **물리 버튼**이라는 명칭을 사용할 것.
- **전송 및 입력:** `app/lib/deck.js`, `app/lib/protocol.js`, `app/lib/page.js`, `app/streamdeck-editor/transport.cjs`; 새 편집기는 `app/streamdeck-editor/`에 독립 구현. 기존 Ulanzi UI/인스펙터 가져오지 않는다.
- **사용자 용도:** 개인용 Windows 편집기. 플러그인 없이 자주 쓰는 Windows/노브 기본 기능 제공이 우선. Ulanzi 플러그인 우선 지원 아이디어는 **후속 과제**, Stream Deck 플러그인 변환기 또한 보류.
- **프로젝트 경로 정책:** 새 로컬 프로젝트는 `E:\Codex` 하위. `E:\Codex\D200X-HomeAssistant`는 이전 HA 플러그인 관련 경로로 기록되어 있으므로 **현재 D200X-Deck의 실제 로컬 루트라고 추정하지 말 것**. 새 대화의 확장 계획서가 이를 로컬 프로젝트 경로라고 적은 부분은 작업 전 별도 확인 필요. 기존 C: 폴더 이동/삭제 임의 실행 금지.

## 2. UI에서 절대로 훼손하지 말 것

사용자는 편집기의 **현재 상단 레이아웃을 승인**했다.

- 왼쪽 상단 14개 화면 키(와이드 키 포함), 물리 버튼 2개, 노브 3개 및 페이지 컨트롤을 스크롤 없이 유지. 왼쪽 하단은 선택한 액션의 속성창. 오른쪽은 상단 프로필/장치 및 기본 액션 검색·목록.
- 원본 Stream Deck처럼 제목을 아이콘 위에 오버레이. **아래/가운데/위** 위치, 글꼴/크기/굵기/기울임/밑줄/색상, 가독성용 윤곽선 색/두께, 사용자 색상 팔레트 유지.
- 아이콘 라이브러리, 이미지 파일 선택, 클립보드 붙여넣기, 간이 아이콘 제작, 실제 D200X 전송 PNG를 편집기 버튼에 표시하는 흐름 유지.
- 페이지 추가(`+`), 삭제(`−`, 마지막 페이지 삭제 금지), 이전/다음, 페이지 표시기, 화면키·노브·물리 버튼 액션 등록 유지.
- **전체 UI 재설계 금지.** 사용자의 구체적인 국소 변경 요청만 반영한다.
- 검증되지 않은 가상 제스처, 특히 **길게 누르기**를 자동 생성해 UI에 넣지 않는다. D200X 실제 장치 이벤트 확인 전에는 누른 상태로 회전하기도 구현 완료로 표시하지 않는다.

## 3. 하드웨어와 안정화 — 보존 최우선

- D200X가 유휴 상태에서 Ulanzi 부팅 로고로 돌아가는 문제를 막기 위해 `transport.cjs`에 약 **5초 유휴 유지 명령**, 연결 실패 후 재연결, 마지막 이미지 복원, 동시 전송 억제를 구현했다. 사용자가 **'연결 안 끊김'**을 보고했다.
- 장치가 보고한 밝기 값을 재전송하거나(알려진 경우), 밝기 임의 변경 없이 이미지 모드 관련 패킷을 보내며, 전송 도중 유지 패킷이 끼지 않도록 한다.
- Electron 사용자 데이터 폴더에 `d200x-connection.log` 기록. USB 프로토콜/keepalive를 액션 개발 중 불필요하게 수정하지 않는다.
- 공개 드라이버 기준 입력 인덱스 15·16(물리 버튼), 17·18·19(노브). 노브 상태 0=뗌, 1=누름, 2=좌회전, 3=우회전으로 코드에 매핑. **실제 사용자의 모든 제스처별 시험은 미완료.**
- 실기 남은 확인: USB 장시간 유휴, 화면 깜빡임, 연결 해제/재연결 후 마지막 페이지 자동 복원, 물리 버튼 반복 눌림, 노브 빠른 연속 회전.

## 4. 입력 및 액션 설정 — 실제 구현과 제약

- 기존 24개 기본 키 액션은 보존. 목록에 노출되는 것과 실제 OS에서 실행되는 것은 다름. 실제로 완료된 액션만 완료라고 말한다.
- 물리 버튼 2개: **누르기** 액션 지정. 노브 3개: **좌회전 / 우회전 / 누르기** 개별 할당, 또는 조절형, 또는 다이얼 스택.
- 공통/페이지별 할당 선택. 노브의 조절형 대상은 기존 `page`, `volume`, `zoom`; 스택은 누름으로 대상 순환. 단순 이전/다음 액션을 노브로 직접 드래그하면 양방향 페이지 이동 조절형으로 등록하는 기존 호환 동작이 있다.
- 기존 설정은 `localStorage`의 `d200x-streamdeck-editor-prototype-v1`를 읽고 `DeckCore.migrateState`로 정규화. **정식 원자적 profile.json 저장은 미완료**. 기존 키/설정 손실 없이 마이그레이션해야 한다.
- **우선 해결할 사용자 버그:** 물리 버튼에 등록한 이전/다음 페이지가 한 번만 작동하거나 페이지가 바뀌며 해제된 듯 보임. 전역/페이지별 저장, down/up과 디바운스, 페이지 변환 중 이벤트 처리, 다른 페이지에서도 배정 유지 여부를 실제 입력 로그와 함께 진단한다. 이미 코드 수정은 있었으나 **실물 해결 확인 안 됨**.
- 과거 일부 기본 액션: 이전/다음/지정 페이지와 기본 브라우저 HTTP(S) 사이트 열기 코드가 존재. Windows 음량 및 활성 앱 확대/축소는 고정 키 신호 전송 방식의 초기 코드 존재. 다른 24개 기본 액션은 UI가 먼저 만들어졌더라도 실행 엔진 구현과 구분.

## 5. 마지막 사용자 요청: 플러그인 없는 기본 액션 확대

핵심 원칙: **원본 24개를 삭제·대체하지 않고**, 별도 플러그인 없이 설치 즉시 쓰는 D200X 기본 기능을 추가한다. **일반 버튼과 노브는 동일한 action.type/settings 및 실행 엔진**을 사용하되 입력 방식(누름/회전)만 달리한다.

계획서 원본: [D200X-BUILTIN-ACTIONS-EXPANSION.md](D200X-BUILTIN-ACTIONS-EXPANSION.md).

### 후보 24개 기능 묶음(전부 독립 엔진을 의미하지 않음)

1. 시스템 음량
2. 음소거
3. 확대·축소·원래 크기
4. 세로/가로 스크롤
5. 실행 취소/다시 실행
6. 창 전환
7. 가상 데스크톱 전환
8. D200X 화면 밝기
9. 기본 출력 장치 선택
10. 마이크 음소거
11. 창 최소화/최대화/복원
12. 창을 다른 모니터로 이동
13. 화면 캡처
14. 복사/붙여넣기/잘라내기
15. 브러시 크기
16. 타임라인 이동
17. 타임라인 확대·축소
18. 탐색기 열기
19. 폴더 바로가기
20. 지정 파일 열기
21. D200X 페이지 이동(**기존 엔진 재사용**)
22. D200X 프로필 전환(**기존 엔진 재사용**)
23. 다중 동작 중 지연(**기존 엔진 재사용**)
24. 액션 토글/순환(**기존 기능 및 공통 엔진 재사용**)

**첫 우선 8개:** 시스템 음량, 시스템 음소거, 확대·축소, 스크롤, 실행 취소/다시 실행, 창 전환, 가상 데스크톱 전환, D200X 화면 밝기.

**노브 공통 조절 옵션:** 1·2·5·10 변화량, 방향 반전, 좌/우 미리보기, 기존 설정 호환. 코드/CI/Windows 빌드 반영 보고(커밋 `40d94409`, Actions run `43567585957`). 하지만 기능별 Windows 앱/D200X 실물 실행은 미검증. 새 구현 시 버튼에서도 같은 기능을 선택 가능한 스키마로 연결할 것.

**주의:** Windows 화면 밝기와 **D200X 기기 밝기**는 다른 기능. D200X 밝기 조절은 기존 장치 keepalive/밝기 값과 충돌하지 않게 연결한다. 확대/축소는 활성 앱이 단축키를 받아야 하며 프로그램별로 다를 수 있다. 브러시/타임라인은 프로그램별 키맵을 설정하되 임의 셸 명령을 조합해 실행하지 말 것.

### 개발 순서(문서 기준)

- P0-A 노브 변화량·반전 계약의 완결성 및 저장/복원/경계값·연속 회전 검사 확인.
- P0-B 버튼과 노브 공통 액션 모델/실행 엔진.
- P0-C 8개 핵심 기능의 각 개별 동작과 결과 검증.
- P0-D 페이지 이동 후 설정 소실/무반응 회귀 수정.
- P1 출력 장치·마이크·창·파일·복사/붙여넣기.
- P1/P2 브러시·타임라인·지연·토글 및 스택 확장.
- 모두 구현 단계와 Windows/D200X 실기 검증 단계를 별도 체크한다.

## 6. 2026-11-14 GitHub 점검 결과와 문서 정합성 경고

대조한 실제 파일: `AGENTS.md`, `docs/D200X-STREAMDECK-ROADMAP.md`, `docs/D200X-BUILTIN-ACTIONS-EXPANSION.md`, `docs/ACTION-MODEL-V2.md`, `app/streamdeck-editor/deck-core.js`, `editor.js`, `main.cjs`, Windows preview workflow, PR #5 및 Actions 기록.

- `40d94409bc8bbe5c8602bcee20bdf29c7f8a83c4` Windows 빌드 [43567585957](https://github.com/SoonCheol/D200X-Deck/actions/runs/43567585957): 성공, artifact `D200X-StreamDeck-Device-Sync-win-x64`.
- 점검 시 더 최근 브랜치 HEAD `f951fb2d6b572aa2a13771e83026954a42fb7e4e`; CI [43567660377](https://github.com/SoonCheol/D200X-Deck/actions/runs/43567660377), Windows [43567656784](https://github.com/SoonCheol/D200X-Deck/actions/runs/43567656784) 성공 기록 확인. **새 세션에서 최신 HEAD 다시 조회.**
- 계획서 `D200X-BUILTIN-ACTIONS-EXPANSION.md`의 **P0-A가 여전히 [ ]**임을 확인했다. 코드 초기 구현/CI 통과와 전체 검증 완료를 혼동하지 말고 체크 상태 및 테스트 근거를 대조 후 수정.
- `AGENTS.md` 일부에는 당시 Windows/CICD 검증 전이라고 남아 있으나 최근 CI/Windows Actions 성공 기록이 있다. 문서 시점의 차이이며 실기 성공은 아니다.
- `AGENTS.md`의 '현재 하드웨어와 액션 실행기는 연결되지 않음'과 구형 로드맵의 '노브는 여전히 미지원/페이지 회전만 지원' 같은 문장은 **과거 단계 기록**이다. 최신 실제 소스가 우선이며 기술 부채로 문서 정리.
- `docs/ACTION-MODEL-V2.md`는 이전 Ulanzi Deck 계열(macOS/OBS/BLE 등)의 과거 설계 기록을 포함한다. **현재 독립 Windows Stream Deck 편집기의 구현 계약과 혼동 금지.** 기존 작업의 참고 자료로만 이용하며 파일 내용에 따라 맥용 실행기 등을 포팅하지 않는다.
- 기존 24개가 모두 실제 실행되는 것으로 간주하지 않는다. 원본 Stream Deck 7.6.1 관찰 문서와 스크린샷을 UI 기준으로 삼되, 구현 상태는 현재 소스/CI/실기 테스트로만 판단.
- PR #5는 검토용 Draft이며 **병합하지 않는다**.

## 7. 필수 빌드 및 배포/다운로드 방식 — 이전 대화와 동일하게

**사용자의 명시 요구: 앞으로 새로운 빌드가 나올 때마다 이전처럼 Windows 파일을 직접 받을 수 있는 GitHub Actions 실행 링크를 제공할 것.** 소스 ZIP이나 커밋 화면만 제공하고 EXE 배포를 생략하지 않는다.

1. 브랜치 `codex/streamdeck-761-clean-editor`에 코드 푸시. 변경으로 시작하는 workflow는 `.github/workflows/streamdeck-clean-preview.yml`.
2. CI와 **`D200X StreamDeck device-sync preview` Windows x64 빌드**를 확인. workflow는 `windows-latest`, Node 22, isolated Electron packaging, `electron-packager`로 `D200X-StreamDeck-Preview.exe`를 포함한 폴더를 만든다.
3. 성공한 **해당 코드 커밋의** GitHub Actions 실행 페이지를 사용자에게 링크한다. 실행 페이지 아래 **Artifacts → `D200X-StreamDeck-Device-Sync-win-x64`**에서 ZIP을 받도록 안내한다. ZIP 압축을 풀고 내부 `D200X-StreamDeck-Preview.exe`를 실행하는 **폴더형 Windows 빌드**임을 알린다.
4. **빌드 성공과 artifact 업로드까지 조회한 뒤** '다운로드 가능'이라고 보고한다. CI만 통과한 경우, 실행 중인 경우, 빌드 실패한 경우에는 'EXE 다운로드 완료'라고 쓰지 말고 실제 상태/실패 사유를 보고한다.
5. 사용자가 직접 ZIP을 받을 수 있는 **GitHub Actions 웹 링크**가 현재 표준 제공 방식. 임의 `sandbox:` 링크를 만들거나 검증되지 않은 파일 직접 주소를 꾸미지 않는다.
6. 링크와 함께 브랜치, 최신 커밋 SHA, CI/빌드 상태, 실기 미검증 사항을 간결하게 기재한다. 워크플로 artifact 보존은 현재 `retention-days: 14`이므로 만료 시 해당 시점의 새 빌드를 실행·확인해야 한다.
7. 기존 `app/streamdeck-editor/transport.cjs`와 HID 재연결/유지통신, 승인 레이아웃을 훼손하지 않았는지 최소 회귀 테스트를 진행한다.
8. **이전의 정상적인 파일 전달 흐름 그대로:** GitHub Actions 페이지 링크 → Artifacts에서 ZIP 다운로드 → 압축 해제 → 내부 EXE 실행. 별도 배포 서버, Releases, 설치 프로그램 배포 방식으로 임의 변경하지 않는다.

**최근 확인된 링크(새 변경 전 기준):**
- 2026-11-14 처음 확장 빌드: https://github.com/SoonCheol/D200X-Deck/actions/runs/43567585957
- 점검 시 최신 빌드: https://github.com/SoonCheol/D200X-Deck/actions/runs/43567656784

## 8. 소스 위치와 협업 절차

| 경로 | 담당 |
|---|---|
| `app/streamdeck-editor/deck-core.js` | 기본 24개 액션, 페이지/노브/물리 버튼 모델, 이벤트에 따른 동작 계획 |
| `app/streamdeck-editor/editor.js` | 승인 UI, 액션 목록·속성창·드래그 등록·하드웨어 이벤트 배포 |
| `app/streamdeck-editor/style.css`, `index.html` | 기존 레이아웃, 물리 컨트롤 하단 슬롯 |
| `app/streamdeck-editor/main.cjs`, `preload.cjs` | Electron과 Windows OS 실행, 제한된 IPC |
| `app/streamdeck-editor/device-sync.js` | 화면 PNG 동기화·하드웨어 입력과 편집기 연결 |
| `app/streamdeck-editor/transport.cjs` | HID 유지통신·연결 복원·페이지 전송 — **보호** |
| `app/lib/deck.js` | 물리 키/노브 HID 이벤트 복호화 |
| `test/streamdeck-core.test.cjs`, `test/streamdeck-transport.test.cjs` | 최소 회귀 검증 |
| `docs/D200X-BUILTIN-ACTIONS-EXPANSION.md` | 추가 24개 후보 및 8개 우선 구현 단계 |
| `docs/D200X-STREAMDECK-ROADMAP.md` | 제품 전체 개발 진행표 |
| `AGENTS.md` | Codex 작업 시작 시 우선 적용할 규칙 |

원본 Stream Deck 조사 자료는 `research/streamdeck/7.6.1/desktop/09-24-action-inspectors-observed.md`와 `research/streamdeck/7.6.1/desktop/screenshots/gui-evidence-761/`에 보존되어 있다. 이미 확보한 자료를 재분석하느라 Codex 한도를 낭비하지 않는다.

개발은 작고 독립적인 작업 단위로 진행한다. GitHub에 커밋/문서 기록, 필요한 테스트와 워크플로 확인, PR #5 업데이트를 남겨 ChatGPT·Codex 어디서든 이어받을 수 있게 한다. 사용자 승인 없이 메인 브랜치 병합, 기존 중요 파일 삭제, 원본 Stream Deck 프로필 수정, 대규모 UI 교체, 플러그인 기능 구현 금지.

## 9. 새 대화창/Codex에 전달할 시작 문구

> **D200X 편집기 개발을 이어간다.** 먼저 `docs/D200X-COMPLETE-HANDOFF-20261114.md`, `AGENTS.md`, `docs/D200X-STREAMDECK-ROADMAP.md`, `docs/D200X-BUILTIN-ACTIONS-EXPANSION.md`를 실제로 읽고 현재 브랜치 HEAD·최근 CI/Windows 빌드를 확인한다. 기존 24개 보존, P0 8개 기능과 버튼·노브 공통 액션 실행 엔진 확장, 물리 버튼 페이지 이동 1회 후 무반응 문제를 우선한다. 승인 UI와 HID 5초 유지통신은 유지한다. 길게 누르기는 실기 검증 없이 구현하지 않는다. 모든 코드/계획은 현재 GitHub 브랜치와 PR #5에 기록하고 임의 병합하지 않는다. **매번 실제 Windows Actions 빌드 및 artifact 업로드 성공을 확인한 뒤 이전과 동일한 다운로드 안내(실행 링크 → Artifacts ZIP → 압축 해제 → EXE 실행)를 제공한다.** 실제 D200X 동작은 사용자 실기 검증 전까지 완료라고 주장하지 않는다.
