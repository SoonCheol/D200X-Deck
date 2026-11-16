# DeckForge 1.0 — Fusion 360 명령 일괄 등록 다음 채팅 전용 인수인계 (2026-11-16)

> **최우선:** 이 문서를 읽은 뒤 **GitHub 연결 도구로 실제 개발 브랜치 소스를 다시 조회**하라. 앞선 채팅에서 이미 구현한 Fusion MCP·프로필 가져오기를 새로 만들지 말 것. 사용자에게 Codex 지시서부터 작성하자거나 GitHub에 접근할 수 없다고 추측하지 말 것. 실제 도구 호출 실패와 권한 제약은 정확히 보고할 것.

## 1. 개발 환경 및 절대 규칙

- 제품 **DeckForge 1.0**, GitHub 저장소 **`SoonCheol/D200X-Deck`**, **유일한 개발 브랜치 `codex/streamdeck-761-clean-editor`**.
- **PR #5 Draft/open/unmerged 유지**, `main` 수정·PR 병합·릴리스 금지(사용자 별도 명시 승인 필요). 이 문서 작성 시작 전 HEAD는 **`b57f45f0cddd1fb6644dcd8480a0efb605d02fb4`**. 이 문서 커밋 이후 HEAD가 바뀌므로 다시 확인할 것.
- 개발은 **현재 연결된 GitHub 도구를 직접 사용**하여 `fetch_file`로 파일·현재 blob SHA 조회 → 최소 범위 `update_file` 또는 `create_file`로 지정 브랜치에 순차 커밋 → 최신 HEAD / CI 확인. 이 방식은 이미 여러 차례 작동했다. **개발 작업을 사용자 PC의 Codex CLI로 떠넘기지 않는다.** 다만 Fusion 360의 실제 로컬 통신·MCP 등록·물리 장치 확인은 해당 Windows PC 환경이 필요하므로 구별한다.
- 사용자 PC 로컬 개발 프로젝트는 `E:\\Codex` 아래 프로젝트별 폴더를 원칙으로 하고, 기존 파일의 이동·삭제·덮어쓰기 금지. PowerShell 선호. 이전 로컬 Fusion 카탈로그/추출 자료가 어디에 있는지 실측 없이 확정하지 말 것.
- 필독 순서: `AGENTS.md` → `docs/D200X-CURRENT-STATUS.md` → 이 문서 → `docs/D200X-NODE-PLUGIN-HANDOFF-20261115.md` → `docs/D200X-STREAMDECK-ROADMAP.md` → `docs/D200X-COMPLETE-HANDOFF-20261114.md` → 실제 대상 코드. **새로운 현재 상태는 날짜별 과거 기록보다 소스·검증 증거가 우선.**
- Elgato **Stream Deck 7.6.1 한국어 Windows UI**를 편집기의 기준으로 하되 대상 하드웨어는 **Ulanzi D200X**. 플러그인 호스트는 **범용 Elgato SDK 호환**을 목표로 하며 Fusion 전용 하드코딩·기존 Stream Deck 비공개 코드 복제 금지.
- 기존 24개 기본 액션, HTML/HA SDK 플러그인, Node.js SDK 호스트, 프로필/폴더/고정 키, 제목 글꼴/프리셋, 사용자의 플러그인 설정과 자격 증명, 노브/물리 입력, 와이드 화면의 **무손실 보존**이 최우선. 원본 Fusion 디자인·FusionStreamDeck 플러그인을 몰래 변경하지 않는다.
- 사용자가 **실행을 명시적으로 지시하면** 필요한 코드 수정·GitHub 커밋·테스트·빌드까지 진행. 단순 검토·프롬프트 작성만 요청하면 실행하지 않는다. 수정 사항/근거/후속 검증 항목은 커밋 메시지와 이 문서·현재 상태표에 남긴다.

## 2. 현재 실제로 구현된 Fusion 360 기능 — '처음부터 개발' 아님

### 2-1. 원본 FusionStreamDeck 호환

- 참조 원본: `AutodeskFusion360/FusionStreamDeck`, 원본 플러그인 `com.autodesk.fusionstreamdeck.sdPlugin`, 액션 UUID `com.autodesk.fusionstreamdeck.runcommand`; **Node.js 24, SDK v2**, `bin/plugin.js` 및 원본 Property Inspector.
- 앱은 Electron 패키지 내 Node 24 런타임으로 원본 Node SDK 플러그인을 실행하고 SDK WebSocket으로 등록·키 이벤트·PI 통신. GitHub Actions의 원본 플러그인 오프라인 통신 자동 검증 근거: [Windows #43689297460](https://github.com/SoonCheol/D200X-Deck/actions/runs/43689297460) 성공 기록.
- 사용자 **직접 실기 보고**: 원본 FusionStreamDeck 설치, `extrude` 검색·PI 검색 결과 표시, D200X 버튼으로 Fusion 실제 **돌출 실행 성공**. 이는 사용자 보고이며 모든 명령의 작동 보증은 아니다.
- `editor.js`에는 명령 ID에 따라 원본 아이콘 캐시 사용·Fusion 연결 상태에서 OFF 표시, `main.cjs`에는 애드인 `/health`와 로컬 이미지 캐시 `fusion-command-icons` 접근 코드. 마지막 사용자 보고로 Fusion 아이콘은 정상 작동. 해당 경로를 무분별하게 재작성하지 말 것.

### 2-2. Fusion MCP와 JSON 일괄 등록 **1차 구현 완료**

- `tools/fusion-mcp/server.cjs`: **로컬 stdio MCP**; `fusion_list_commands({query,offset,limit,refresh})`, `fusion_export_batch({command_ids,profile_name})` 또는 `{all:true,profile_name}`.
- MCP는 `%LOCALAPPDATA%\\FusionStreamDeck\\endpoint.json`에서 실제 Fusion 애드인의 현재 `127.0.0.1` 포트를 확인하고 `GET /commands` 호출. **현재 로드된 워크스페이스만** 읽으며 Fusion 디자인이나 DeckForge 프로필은 변경하지 않음.
- 내보낸 파일은 `d200x-fusion-batch-v1` JSON, 기본 `%USERPROFILE%\\Downloads\\D200X-Fusion-Commands-<timestamp>.json`. `D200X_FUSION_BATCH_DIR`로 출력 위치만 변경 가능. 덮어쓰기 방지.
- `app/streamdeck-editor/fusion-batch.js`: 입력 검증·ID 중복 제거 아님(중복 시 거부)·새 **별도 Fusion 프로필 생성** 및 각 버튼에 SDK Run Command와 `commandId` 지정. **페이지당 일반 키 13개**, 와이드 index 13에 액션 등록 금지, 최대 **128페이지/1,664명령**. 기존 프로필·일반 버튼·와이드 정보 화면 설정 보존.
- `app/streamdeck-editor/editor.js`: **프로필 메뉴 → 전체 프로필 관리 → Fusion 360 명령 일괄 등록 JSON 가져오기**. 사용자 확인 뒤 새 프로필 생성; 앱에 원본 Fusion 플러그인이 설치되어 있어야 함. 기존 설정 전체 덮어쓰기 금지.
- `test/streamdeck-fusion-mcp.test.cjs`에 6개 자동 검사. 기록상 [Windows #43697835588](https://github.com/SoonCheol/D200X-Deck/actions/runs/43697835588) 성공; 실제 Windows GUI 가져오기 및 사용자 PC Codex MCP 등록·Fusion 라이브 조회는 **아직 확인되지 않음**.
- **사용자 PC 설치형 MCP 방식**: `tools/fusion-mcp/README.md` 참조. `%LOCALAPPDATA%\\Programs\\DeckForge\\resources\\mcp\\deckforge-mcp.cmd`를 `codex mcp add deckforge-fusion -- cmd.exe /d /c "..."`로 등록하도록 문서화됨. 번들 Electron Node.js 사용, 로컬 개발용 Node 설치 없이 사용하도록 구성. **실제 사용자의 설치 경로/등록 상태는 먼저 확인**.
- `tools/fusion-mcp/fusion-command-catalog-final.json`, `fusion-command-analysis.md`, `build-fusion-command-catalog.py`가 소스 자료로 있음. 분석 보고서 기준 총 3,266 명령/24,405 경로, 1,368 direct toolbar, 131 toolbar dropdown, 892 menu only, 873 unplaced 등. **카탈로그의 존재/명령 이름은 실제 Fusion 실행 가능성의 보증이 아님.** `fusion-command-analysis.md`에서 499개 API 오류와 미확인 명칭 120개를 보고함. 원본 비공개 XML·전체 API 캡처는 GitHub에 올리지 않는 것이 기존 정책.

## 3. 발견된 정확한 후속 점검 항목

- **확인창 페이지 수 불일치(현재 소스에서 직접 확인):** `editor.js`의 Fusion JSON 가져오기 확인 메시지는 `const pages=Math.ceil(input.commands.length/14)`로 표시하지만 **실제 배치와 MCP 출력은 13개/페이지**. 기능 구현·자동 배치가 13개로 맞춰져 있으므로 다음 코드 작업 시 확인창만 `D200XFusionBatch.KEYS_PER_PAGE` 기준으로 고치고 14개 명령 등 회귀 테스트 추가. 이 문제를 이유로 전체 일괄 등록 로직을 갈아엎지 말 것.
- **기존 기록의 숫자 혼선:** 초기 상태표 일부 옛 문단에는 14개/페이지·1,792개 최대라는 계획이 남아 있음. 이는 **과거 이력**, 현재 `fusion-batch.js` `KEYS_PER_PAGE=13`, `MAX=1664`와 최신 문서가 우선.
- 사용자 다음 목표는 **Fusion 360 명령 일괄 등록 개발**. 이미 구현된 MCP·JSON 가져오기를 실제 사용 환경에 맞춰 검증하고, 부족한 경우 안전하게 확장하는 것부터 시작. 사용자 요구에 없는 전체 명령 자동 등록, 다른 프로필 덮어쓰기, Fusion 디자인 변경, 광범위한 재구현을 임의 실행하지 않는다.
- 사용자가 원하는 '일괄등록'의 범위를 최신 발화와 실제 상태로 판단: 현재는 별도 JSON 가져오기 기능이 있는 상태. 다음 채팅에서는 **현재 구현·현재 한계 설명 후 정확히 필요한 변경을 실행**한다. 실기·앱 메뉴 경로가 추측으로 바뀌지 않게 코드와 README에서 확인하라.

## 4. 현재 제품 및 최근 글꼴 작업 (안전 회귀)

- Windows 제품 **DeckForge 1.0**, NSIS per-user 설치형 `DeckForge-Setup-1.0.0.exe`, 포터블 `DeckForge.exe`. 설치 위치는 사용자별 `%LOCALAPPDATA%\\Programs\\DeckForge`. 구 `%APPDATA%\\D200X StreamDeck Device Sync` 저장 데이터 보존.
- 빌드 워크플로: `.github/workflows/streamdeck-clean-preview.yml` — **해당 브랜치 앱 코드 변경 시 자동 push 빌드, `workflow_dispatch` 수동 빌드**, `DeckForge-1.0-Setup-win-x64`, `DeckForge-1.0-win-x64` 아티팩트. 마지막으로 문서에 **성공 확인**된 설치형 빌드 예시는 [#43699754327](https://github.com/SoonCheol/D200X-Deck/actions/runs/43699754327); **이후 글꼴/UI 수정에 대한 Windows 아티팩트 존재/최신 성공 여부는 확인하지 못했음**. 과거 성공을 최신 빌드 성공으로 바꾸어 말하지 말 것.
- 앱 내장 글꼴: `PretendardVariable.woff2`, `NotoSansSymbols.ttf`, `NotoSansSymbols2-Regular.ttf`를 공식 저장소의 고정 버전에서 Windows 빌드 중 다운로드·Git blob SHA 검사·패키징하는 구조. 바이너리를 GitHub 소스에 직접 커밋하지 않는다. `docs/D200X-FONT-EMBEDDING-20261116.md` 참조.
- 제목 행 `제목 표시` 체크박스 → 제목 입력란 → 필드 안 `T⌄`; 팝업 내부 중복 제목 체크박스/프리셋 표제 삭제. 선택기만 노출하며 프리셋 변경은 열린 속성창의 각 입력에 즉시 반영; 저장(＋)/삭제(−) 유지. 관련 코드 `editor.js`, `style.css`, `device-sync.js` 및 `test/streamdeck-inspector-layout.test.cjs`.
- 이전 작업의 코드·문서 마무리 HEAD `b57f45f0`; PR CI [#43799006679](https://github.com/SoonCheol/D200X-Deck/actions/runs/43799006679) 성공 확인(후속 문서 커밋 검증은 별도). **Windows/D200X 글꼴 및 새 UI 실기 검증은 안 됨**.

## 5. 새 채팅의 올바른 실행 절차

1. **GitHub 접근 확인:** GitHub 연결 도구를 찾아 실제로 `get_pr_info(PR #5)`, `fetch_file(AGENTS.md/현재 상태표/이 문서/관련 소스, ref=codex/streamdeck-761-clean-editor)`를 호출. 접근이 실패할 때만 증거를 포함해 보고. 연결 가능하면 Codex 토큰은 필요 없음.
2. **현재 Fusion 코드 및 데이터 계약 확인:** `tools/fusion-mcp/README.md`, `server.cjs`, `app/streamdeck-editor/fusion-batch.js`, `editor.js`의 일괄 등록 부분, `test/streamdeck-fusion-mcp.test.cjs`와 `docs/D200X-CURRENT-STATUS.md`. 다음 작업에 필요한 부분만 읽고 과거 대화 전체 반복 조사 금지.
3. **수정 범위 최소화:** 사용자가 지시한 기능만 수정. JSON 검증과 기존 프로필 보존, 일반 키 13개/페이지, 와이드 슬롯 할당 금지 및 원본 플러그인 설정 유지. 발견된 `/14` 표시 오류는 관련 기능을 수정할 때 함께 교정.
4. **커밋·검증:** 수정 파일별 기능적 의미가 있는 커밋 메시지, 회귀 테스트, 최신 기능 상태표 + 이 인수인계서 갱신. 각 커밋의 GitHub 원격 SHA·PR #5 Draft/unmerged 확인.
5. **Windows 빌드:** 앱 코드 변경 시 기존 자동 Actions 조건을 활용. PR 기반 CI와 push 기반 Windows packaging은 **서로 다른 워크플로**. 설치형 빌드 성공·아티팩트 링크는 실제 해당 run/아티팩트를 조회한 경우에만 보고. 실물 Windows GUI/Fusion/D200X 동작은 사용자 확인 또는 실제 도구 증거 없으면 미검증으로 기록.
6. **다음 채팅 첫 답변:** 최신 SHA와 현재 구현된 Fusion MCP·가져오기 상태를 짧게 요약하고, 사용자 지시 내용에 곧바로 착수. **이미 구축한 GitHub 개발 환경을 모른다고 주장하거나 Codex CLI 사용을 강요하지 않는다.**

## 6. 이번 인수인계의 범위

- 이번 작업은 **최신 GitHub 소스 및 문서 검토·인수인계 기록**이며 **Fusion 코드·설정·프로필·장치·Windows EXE를 변경하지 않음**.
- 새 채팅에서 실제 Fusion 일괄 등록의 개선·수정·빌드는 사용자 요청 범위에 맞춰 수행한다.
