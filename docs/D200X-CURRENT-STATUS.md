## 2026-11-16 — DeckForge 1.1 통합 설치 후보 (Windows 결과 검증 진행)

- **사용자 승인:** DeckForge와 Fusion Command Manager 통합 설치/상호 실행, FusionStreamDeck과 Home Assistant 기본 SDK 플러그인 내장, Fusion Python 애드인 자동 복사 및 나중 설치 버튼, 양 플러그인 사용법 도움말, Fusion 원본 아이콘 연결 시 로컬 수집, 두 창 자석 결합(DeckForge 높이 기준) 및 ON/OFF·선호 저장. 기능 구현 후 버전 1.1.0.
- **구현:** `app/streamdeck-editor/bundled-integration.cjs`에서 누락된 SDK 플러그인만 설치(기존 플러그인/설정/HA 토큰 보존), Fusion AddIns 폴더 존재 시에만 add-in 복사(기존 대상 무변경). DeckForge `main.cjs`에서 Fusion Manager를 같은 Electron 프로세스의 별도 BrowserWindow로 열어 창 위치/높이 연동. Plugin 탭에 매니저 실행, Fusion 애드인 설치, 플러그인별 `?` 도움말 추가. Fusion Manager의 `DeckForge 열기`/자석 상태 버튼, 원본 아이콘 자동 수집 구현.
- **패키징:** `.github/workflows/streamdeck-clean-preview.yml`에서 고정 Autodesk FusionStreamDeck 소스/애드인과 MIT 라이선스, HA 3.8.4 릴리스 바이너리 및 MIT 라이선스, Manager 소스/JSON/Pretendard를 독립 staging 및 `resources/bundled`로 구성. HA ZIP 크기/매니페스트 UUID 검사, Fusion 매니페스트 UUID 검사 추가. NSIS `customInstall` 복사 스크립트(기존 add-in 덮어쓰기 금지), 별도 Fusion Manager 시작 메뉴 바로가기 추가. DeckForge 1.1.0으로 패키지·제목·설치 파일 버전 정합.
- **자동 테스트:** `test/streamdeck-integrated-manager.test.cjs`는 도킹/높이 및 플러그인 중복 설치 방지 등을 검사. 기능 CI [#43866292208](https://github.com/SoonCheol/D200X-Deck/actions/runs/43866292208) 성공. 최종 HEAD/Windows Actions 전체 실행과 실제 Windows/D200X/Fusion/HA 실기는 별도 검증. CI만으로 설치 파일 생성이나 실기 성공을 주장하지 말 것.
- **브랜치 정책:** `codex/streamdeck-761-clean-editor`만 변경, PR #5 미병합. 기존 DeckForge 사용자 데이터 경로 `%APPDATA%\\D200X StreamDeck Device Sync` 그대로 유지.

## 2026-11-16 — Fusion Manager 요청 레이아웃 일괄 반영 (최신)

- 실행 기본 창 698×873px (모니터 workArea 이내), 페이지 편집 모드는 기존 1240px 확장 유지. 작업 영역 9개 탭을 동일 폭 그리드로, 패널 메뉴는 최소 내용 폭과 균등 확장을 조합해 창 너비에 맞춰 줄바꿈. 기존 여백 유지.
- 탐색 패널의 `전체/RectangleDropDown/...` 드롭다운 선택 줄을 완전히 삭제하고 모든 하위 메뉴 명령을 기존 Fusion 메뉴 계층 순서대로 펼쳐 표시. 메뉴 카탈로그와 기존 사용자 배치 JSON은 보존.
- Pretendard Variable WOFF2를 기존 DeckForge 고정된 공식 원본/해시 기준으로 매니저 전용 Windows CI에서 다운로드 검증 후 독립 실행 파일에 내장. OFL 라이선스도 포함. DeckForge 앱 소스는 수정하지 않음.
- Fusion UI JSON 및 현재 목록 원본 아이콘 수집 버튼 옆에 `?` 설명을 추가. 원본 `fusion-ui-inventory.py`를 매니저에 포함해 코드 표시/복사 가능; 상단 Markdown 도움말은 그대로 보존.
- CI/Windows 빌드/사용자 Windows GUI 실기 성공은 해당 실행의 확인 결과로만 별도 판정. 기존 프로젝트/프로필 설정 변경 없음.

## 2026-11-16 — Fusion Command Manager 상단 Markdown 도움말 및 하단 안내문 제거

- `tools/fusion-manager/index.html`의 고정 하단 안내문을 제거하고 상단 오른쪽에 `? 도움말` 버튼과 닫기 가능한 도움말 대화상자를 추가.
- `tools/fusion-manager/HELP.md`를 로컬 설치 패키지에 포함하고 IPC로 읽어 표시. Fusion 실행/애드인 연결이 필요한 기능과 오프라인 탐색 및 Codex MCP 기능의 전제조건을 구분하여 안내.
- `.github/workflows/fusion-manager-preview.yml`에 `HELP.md` 패키징 및 테스트 추가. **DeckForge 본체 및 사용자 프로필 미변경.** Windows GUI/실제 연결은 사용자 PC 테스트 필요. CI/Windows 빌드 결과는 실행별 확인 후에만 성공 표기.

## 2026-11-16 — Fusion Command Manager 실제 메뉴 순서 적용 (최신 코드)

- 사용자 우선순위: Fusion 디자인 메뉴의 **스케치 → 솔리드 → 곡면 → 메쉬 → 판금 → 플라스틱 → 매니지 → 유틸리티 → 자동화** 순서, 각 탭 패널 왼쪽→오른쪽, 접힌 드롭다운 자식 위→아래. 메뉴 외 API 전용 명령 분류 작업은 이번 범위에서 제외.
- `tools/fusion-mcp/fusion-menu-catalog.json`의 959개 실제 메뉴 배치(고유 ID 326개)를 Manager의 탐색 원천으로 연결. 기존 3,266개 전체 원본 카탈로그/프로젝트 JSON은 삭제·재배치하지 않으며, 탐색 시 실제 메뉴 카탈로그 순서로 표시. 반복된 동일 ID는 선택 메뉴 안에서 중복 제거하고 원래 메뉴 위치를 존중. 별도 DeckForge 본체 소스 미변경.
- 변경: Manager IPC/preload, `menu-tree.cjs`, `renderer.js`, Manager 전용 Windows 워크플로의 카탈로그 패키징, 메뉴 순서 단위/실자료 회귀 테스트. **CI 및 Windows 전용 빌드는 해당 실행의 성공 여부를 확인해야 하며, Windows GUI/Fusion/D200X 실기 검증은 미실시.**

## 2026-11-16 — Fusion Command Manager 메뉴 탐색형 리디자인 + DeckForge 직접 드롭 (최종 빌드 성공)

- **사용자 요청**: DeckForge와 나란히 배치하는 620px 폭 보조 창. Fusion 대분류→하위 메뉴→원본 아이콘/명령 탐색(100px 내외 × 82px, 원본 32px, 한글 13px), 상단 가로 메뉴. 기존 여러 페이지 5/5/3 편집은 별도 확장 모드로 유지. 메뉴 명령을 Manager 페이지나 DeckForge 일반 키로 드래그해서 자동 등록. 승인 추가 요청 없이 Windows 빌드까지.
- **Manager** `tools/fusion-manager/index.html`, `renderer.js`, `menu-tree.cjs`, `main.cjs`, `preload.cjs` 수정. 탐색/페이지 편집 전환: 기본 620px(최소 480px), 편집 약 1240px(모니터 범위 내); 작업영역/메뉴/드롭다운 가로탭·명령 검색·원본 이미지 32×32·툴팁(긴 명령만 한글/영문 두 줄)·ⓘ 상세 정보; 처음에는 **빈 페이지**로 시작하여 기존 명령 자동배치 제거(사용자가 누르면 기존 자동배치 가능). 기존 프로젝트 JSON·DeckForge batch v1 JSON·예약 슬롯·페이지 체크·아이콘 수집·사용자 숨김 설정 보존.
- **명령 분류**: `menu-tree.cjs`에서 보유 중인 실제 placement path와 선택적으로 가져온 Fusion UI v1/v2 capture를 사용해 작업 영역/패널/재귀 드롭다운을 구성. 동일 ID는 선택 메뉴 안에서 1회 표현, 같은 이름의 다른 ID는 별도 유지. API가 제공한 한글 패널명과 실제 panel/dropdown position 우선; 확인할 수 없는 ID는 임의 번역하지 않음. Fusion UI 수집 JSON은 사용자 선택으로 가져오고 매니저 데이터 디렉터리에 보존해 재시작 후에도 복원. `fusion-ui-inventory.py`는 위치·표시 상태·isPromoted 조회 및 Python 구문 검사 포함. Fusion 실기 새 JSON 수집은 사용자 PC에서 필요.
- **앱 간 드래그**: `app/streamdeck-editor/fusion-drag.cjs` 공통 v1 text/plain payload의 명령 ID, 이름, 선택적으로 실제로 저장된 소형 PNG만 전달(일부 SVG는 전달하지 않고 SDK 원본 아이콘 갱신 사용). DeckForge `editor.js`에서 일반 버튼 13개에 드롭 시 플러그인 설치 확인, 기존 액션 덮어쓰기 확인, title=한글명(최대30자), pluginUUID/actionUUID/pluginSettings.commandId 구성, setItem/persist/render 처리; 작동 중 원본 PNG가 함께 전달되면 기존 icon cache에 보관. 넓은 정보화면 index 13에서는 등록 안 함. 기존 자체 액션 드래그, 전체 Fusion batch import, DeckForge 프로필은 유지.
- **경계**: 서로 다른 Electron 창 사이 Windows 실제 드래그는 **사용자 PC 실기 미검증**. 코드/CI/EXE 패키징 성공은 실제 OS 간 드래그 성공의 증거가 아님. 올바른 메뉴 계층과 실제 원본 아이콘은 Fusion 내부 수집 JSON 및 애드인/아이콘 캐시 품질에 따름; 별도 UI 조작·명령 실행 자동화 없음. 다른 프로그램/슬롯 드롭에 대한 테스트 추가 필요.
- **자동 검증**: `test/fusion-menu-navigation.test.cjs`은 메뉴 분류·다른 ID·드롭다운 계층·순서·엄격 드래그/PNG 페이로드 검사. 기존 Fusion curation/JSON 회귀, Python 구문, DeckForge Windows build 검증. 최신 source commit `f0e955886a2f86b9661d5cf4a2f9cfc32bf39303`.
- **Manager Windows 빌드**: [run 43826638637](https://github.com/SoonCheol/D200X-Deck/actions/runs/43826638637) **completed/success**; artifact `Fusion-Command-Manager-0.1-win-x64` ID `14207026845`, 161,636,874B (Windows 폴더형 포터블 EXE 압축).
- **DeckForge Windows 빌드**: [run 43826638566](https://github.com/SoonCheol/D200X-Deck/actions/runs/43826638566) **completed/success**; installer artifact `DeckForge-1.0-Setup-win-x64` ID `14206992176`, 126,053,136B; portable artifact `DeckForge-1.0-win-x64` ID `14207056851`, 173,200,102B. **현재 사용 중인 설치본에는 새 외부 드롭 처리가 없으므로 이 빌드로 업데이트해야 함.**
- **브랜치 보호**: `codex/streamdeck-761-clean-editor`만 변경. `main` 미변경, PR #5 병합하지 않음. 실기 테스트와 후속 수정은 이 상태부터 시작.

## 2026-11-16 — Fusion UI 명령 수집·신뢰도별 표시 개선 (작업 완료 / 실기 대기)

- **목표**: 의미 없는 키워드 정렬 제거, Fusion의 툴바 직접 명령과 드롭다운 명령을 우선 표시. 메뉴 전용은 검토, 미배치/디버그/정보 부족은 숨김 처리하되 삭제하지 않는다. 동일 한글명/아이콘이라도 다른 ID는 절대로 자동 병합하지 않는다.
- **수집기** `tools/fusion-mcp/fusion-ui-inventory.py`: 읽기 전용 API 순회, 작업영역→탭→패널→컨트롤/드롭다운/Split Button 경로와 위치, 명령 ID·이름, 컨트롤 표시·활성 상태, 오류 기록. 출력 형식 `deckforge-fusion-ui-placements-v2`; v1 가져오기 유지. 현재 화면에 안 보인다는 이유로 실행 불가나 무용 판정 금지. **Fusion 명령 실행/작업영역 강제 전환 없음.**
- **분류 모듈** `tools/fusion-manager/command-curation.cjs`: 직접/드롭다운→primary, 메뉴 전용→review, 미배치/정보 부족/디버그→hidden, 전체 목록 복구. 발견된 수집 ID는 primary로 승격; 이번 스캔에 없는 ID는 기존 카탈로그 분류를 유지. 동일 ID만 합치고 동일 이름의 다른 ID는 별도 보존·상세 정보 표시.
- **매니저 GUI**: 목록 필터 `툴바·드롭다운/검토 대상/숨김 대상/전체`; `Fusion UI 수집 JSON 반영` 버튼으로 수동 JSON import. 기존 페이지는 가져오기만으로 변경하지 않음. 자동 추천 배치 키워드 정렬→수집된 UI/카탈로그 경로순 변경. 명령 상세 정보에서 `자동 분류/기본 표시/검토/숨김`을 수동 선택하고 manager userData `fusion-command-visibility-v1.json`에 저장. 128페이지 한도 초과 시 기존 페이지 보존하고 자동 배치 거절.
- **원본 보존**: 3,266개 카탈로그 원본 / 기존 프로젝트·DeckForge 프로필·Plugin·아이콘 캐시·JSON 내보내기 포맷을 변경하지 않음. 원본 아이콘 직접 가져오기 기능은 이전 방식 유지. 외부 앱 사이 드래그는 아직 구현하지 않음.
- **자동 검증**: `test/fusion-command-curation.test.cjs` 5개 케이스(구분·ID 보존·동명 다른 ID·v1/v2 수집·배치 경로순), 기존 Fusion JSON 회귀 및 Python 구문 검사 GitHub Actions 단계 성공.
- **Windows 빌드** [GitHub Actions #43821325020](https://github.com/SoonCheol/D200X-Deck/actions/runs/43821325020) **completed/success**, artifact `Fusion-Command-Manager-0.1-win-x64` ID `14204302520`, 161,631,294 bytes, 조회 당시 미만료. PR #5는 open/draft/unmerged.
- **검증 한계**: Fusion 앱 안에서 실수집/499건의 기존 API 조회 오류 재현 및 Windows GUI 메뉴·아이콘 실기 검증은 아직 사용자 PC에서 진행 전. UI 수집 JSON은 현재 사용자 선택 파일이며, 자동 수집/백그라운드 실기 검증 기능은 구현하지 않음. '현재 활성화'와 '실행 가능'은 구별해야 함.

## 2026-11-16 — Fusion Command Manager에서 Fusion 원본 아이콘 직접 수집

- 사용자 요청: DeckForge가 하던 Fusion 원본 명령 아이콘 획득/저장 기능을 독립 Fusion Manager에도 추가. **명령 이름으로 추정한 가짜 아이콘 사용 금지** 유지.
- 확인 근거: AutodeskFusion360/FusionStreamDeck 공식 버전 bc153b8cddedba91614f932f4210f1ecb451c2a8 의 `fusion_addin/FusionStreamDeck/lib/server.py`에서 GET `/health`, GET `/icon?commandId=...&size=32`가 제공되며 PNG/SVG를 직접 송신함. `icons.py`는 명령의 원본 `resourceFolder`에서 가장 적절한 파일을 선택. 실행은 별도 POST `/command`이고 매니저에서 호출하지 않음.
- 구현: tools/fusion-manager/main.cjs에서 %LOCALAPPDATA%/FusionStreamDeck/endpoint.json 에서 포트 발견, /health 체크, GET /icon 호출, PNG 헤더 및 SVG 구문과 768KB 제한 후 매니저 userData `original-fusion-icons/<명령ID>.png|svg`로 영속 저장. 기존 DeckForge 원본 PNG 캐시는 읽기 전용으로 보조 사용. Electron preload는 iconHealth/collectIcon IPC를 노출. renderer는 선택 체크된 페이지의 고유 명령 IDs만 사용자가 버튼 눌렀을 때 최대 3개 병렬로 수집하고 신규/기존/없음/실패 상태 표시; 완수 후 실 아이콘 표시.
- GUI: `선택 페이지 원본 아이콘 수집` 버튼, 상태 텍스트. 기존 프로젝트 JSON/DeckForge 등록용 JSON/폴더 없는 프로필/예약 슬롯/드래그 유지.
- 검증: JS 구문 확인 통과, GitHub Actions [Windows run #43813062245](https://github.com/SoonCheol/D200X-Deck/actions/runs/43813062245) **completed/success**; 업로드된 artifact `Fusion-Command-Manager-0.1-win-x64` ID `14201735344` 161,628,424 bytes, 조회 당시 미만료. PR CI also success.
- **실제 Fusion 로컬 add-in 아이콘 API 연결 및 저장 개수는 CI에서 검증할 수 없음. 사용자 실기 테스트 필요.** DeckForge 본체 수정/PR 병합 없음.

## 2026-11-16 — Fusion Command Manager 0.2 버튼 확대·명령 아이콘·툴팁

- 사용자 요청대로 Fusion Manager 버튼 높이 116px, 아이콘 48×48px, 한글 이름 최대 두 줄 배치. 5/5/3, 페이지 간 드래그 삽입, 우클릭 예약, 체크박스, JSON 내보내기 구조 변경 없음.
- Fusion PNG는 기존 DeckForge 사용자 데이터의 `fusion-command-icons/<명령ID>.png`를 **읽기 전용**으로 조회. 존재하지 않으면 심볼 기호를 표시하므로 원본 아이콘이 전부 제공된다는 뜻은 아님.
- 말줄임 발생한 이름의 hover 툴팁에 **한글 전체 이름 + 영문 전체 이름** 두 줄만 표시. 명령의 확인된 영문명 필드가 없으면 '영문명 정보 없음'을 명시. ⓘ 상세 정보는 별도 패널.
- 안전 변경: tools/fusion-manager/main.cjs, preload.cjs, renderer.js, index.html, README.md만 수정. DeckForge 본체·기존 프로필/캐시/플러그인 미변경.
- 검증: GitHub Actions [Fusion Manager Windows build #43811137327](https://github.com/SoonCheol/D200X-Deck/actions/runs/43811137327) **success**, artifact `Fusion-Command-Manager-0.1-win-x64` ID `14200348334` (약 161.6MB, 조회 당시 미만료). JS 구문 검사 및 카탈로그 검증/EXE 패키징 성공. **원본 캐시 PNG 노출 및 Windows GUI 실기는 사용자 확인 전**. 아티팩트 이름은 워크플로 기존 0.1 표시를 유지.
- Manager 프로그램 자체의 고유 앱 아이콘은 이번 소스 변경에 포함되지 않음. 추가 디자인 과제.

## 2026-11-16 — 개별 프로필 JSON 내보내기 (개발 및 검증 기록)

- 사용자 요청: 프로필 ⚙ 설정에 기존 '전체 프로필·설정 JSON 내보내기'와 별도의 '프로필 JSON 내보내기' 추가.
- 구현: app/streamdeck-editor/editor.js의 프로필별 메뉴에 내보내기 추가. deck-core.js의 exportSingleProfile(state, id)로 선택 프로필만 이름/ID/연결 EXE/Smart Profile 여부, 페이지·폴더·노브·물리 버튼·고정 키·와이드 설정 스냅샷을 추출. 활성/비활성 프로필 모두 지원하며 상태 변경 없음.
- 파일 형식: d200x-single-profile-v1 (프로필 메타데이터와 snapshot). **기존 '전체 프로필·설정 JSON 가져오기'는 이 파일을 가져오는 기능이 아님**. 단독 프로필 가져오기는 별도 요청 시 구현해야 하며 호환되지 않는 전체 가져오기로 대체하지 말 것.
- '연결 프로그램 선택'은 Windows .exe 연계로 Smart Profile의 전경 프로그램 자동 선택에 쓰며 JSON 보기용 아님. 자동 전환은 최소화 상태/Smart Profile 활성 조건을 따름.
- test/streamdeck-core.test.cjs에 프로필 간 데이터 격리, 활성/비활성 스냅샷, 상태 무변경 검사 추가. 최종 CI/Windows 빌드/사용자 실기 판정은 실제 Actions 결과에 맞춰 후속 갱신.
- main 및 Draft PR #5 병합·변경 금지, 기존 모든 프로필 데이터 보존.

## 2026-11-16 — Fusion Command Manager 0.1 실제 Windows 빌드 검증

- 전용 GitHub Actions **#43808195316**: completed/success. GitHub Windows 작업의 JavaScript 소스 검사, layoutPages 구형/신형 회귀 검사, 카탈로그 키·명령 ID·1000개 이상 형식 검증, Electron 독립 EXE 패키징, 아티팩트 업로드가 모두 성공함.
- 아티팩트: **Fusion-Command-Manager-0.1-win-x64**, ID **14199267057**, 약 161.6MB, 조회 당시 미만료. 링크: https://github.com/SoonCheol/D200X-Deck/actions/runs/43808195316
- 기존 DeckForge Windows build **#43807695960** success. 수정한 Fusion JSON importer의 Windows 빌드 확인 근거.
- **실제 Fusion/Windows GUI 사용자 실기 확인은 아직 없음.** 기존 JSON 자동등록 실기 성공은 사용자 확인, 새로운 예약 슬롯 포함 JSON의 실기 성공은 별도 확인 필요.

## 2026-11-16 — Fusion Command Manager 독립 GUI 시제품 0.1

- 사용자 실기 확인 추가: 기존 Fusion 360 JSON 일괄 등록 메뉴를 통한 실제 자동 등록 **성공**(사용자 2026-11-16 보고). 본 프로젝트의 기존 가져오기 메뉴는 그대로 사용.
- 신규 독립 앱 코드: tools/fusion-manager/ 아래 Electron main/preload/HTML/renderer/README. 5-5-3 페이지 다중 표시, 명령 삽입 드래그, 우클릭 예약, 페이지별 등록 체크, JSON 프로젝트 저장/불러오기, DeckForge 등록용 JSON 내보내기.
- 기존 importer는 선택적인 layoutPages 13슬롯 배열을 읽어 예약 빈 슬롯과 페이지 경계를 보존하며, 기존 commands-only d200x-fusion-batch-v1 JSON도 유지.
- 전용 Windows GitHub Actions workflow: .github/workflows/fusion-manager-preview.yml, 아티팩트 예정 이름 Fusion-Command-Manager-0.1-win-x64. 코드 구문 확인 및 PR CI 테스트 성공 확인; **전용 Windows EXE 성공/아티팩트는 조회 확인 전까지 미검증**.
- 카탈로그 3,266명령 분석 자료 활용. 시제품 추천 순서는 임시 휴리스틱이며 인터넷 사용 빈도 실측값 아님. 정식 근거 기반 우선순위, 아이콘, 카탈로그 실제 화면, Windows GUI/Fusion 실기는 후속 검증 필요.
- 폴더 생성 기능 이번 Fusion 배치에서 사용하지 않음. PR #5 Draft/open, main/기존 프로필 변경 금지.

## 2026-11-16 — Fusion 360 일괄 등록 새 채팅 인수인계 (문서 작업만)

- **다음 채팅 첫 진입점:** [Fusion 360 명령 일괄 등록 인수인계](D200X-FUSION-BATCH-HANDOFF-20261116.md). GitHub 개발 환경/단일 브랜치/Draft PR 보존, 기존 구현, Codex MCP와 GitHub 코드 개발의 역할 분리, 다음 검증 순서 포함.
- **현재 코드 기준:** `tools/fusion-mcp/server.cjs`의 읽기 전용 명령 검색·배치 JSON 생성과 `app/streamdeck-editor/fusion-batch.js`의 새 Fusion 프로필 가져오기·**13개 일반 키/페이지·와이드 index 13 보호**는 이미 구현됨. 새로 만드는 작업으로 취급하지 말 것.
- **확인한 사소한 오류(미수정):** `editor.js`의 JSON 가져오기 확인창 안내 페이지만 `Math.ceil(input.commands.length/14)`로 계산. 실제 생성은 `/13`. 다음 관련 코드 수정 시 최소 패치/테스트 대상.
- **검증 상태:** 사용자 보고 원본 Fusion `extrude` 실행 성공, 과거 Windows CI/MCP 모의 테스트 성공. 로컬 MCP 등록·실제 일괄 JSON GUI 가져오기 및 이번 글꼴 UI 후속 Windows 아티팩트는 별도 확인 필요. **이번 턴은 소스 코드·사용자 환경·프로필·빌드를 전혀 수정하지 않음.**

## 2026-11-15 플러그인 속성창 누락 수정 — UI 코드 반영 / Windows 실기 미확인

- **사용자 승인 후 반영:** Home Assistant SDK 플러그인 속성창 상단 경로의 일반 이름 'Stream Deck SDK 플러그인' 대신 실제 설치된 액션 이름을 표시한다. 예: `액션 > 플러그인 > Home Assistant 장치 제어`. 다른 SDK 액션은 실제 actionName / 설치된 플러그인 카탈로그명을 사용하며 기존 UUID·SDK 연결 유지.
- **불필요한 행 제거:** `설치된 플러그인`, `원본 속성 편집기 / 설정 열기`, `상태별 아이콘 ...` 설명을 제거한다. 기존 플러그인 속성 기능은 `플러그인 속성 열기` 버튼으로 유지.
- **제목 한 줄:** `제목` 라벨은 기존 왼쪽에 유지. 제목 입력 필드 **238px**와 `플러그인 속성 열기` 버튼 **158px**를 나란히 배치(8px 간격 = 404px); 제목 글꼴 `T⌄`는 입력 필드 오른쪽 안쪽 유지.
- **OFF/ON 아이콘:** 각 카드 196px 고정, 카드 사이 12px 간격. 아이콘 84px와 오른쪽 라이브러리/파일/초기화 버튼 76×25px 세로 3개를 유지. 카드에 불필요한 삭제 × 추가하지 않음. 사용자가 보유한 기존 아이콘 설정이나 SDK 플러그인 데이터를 수정하지 않음.
- **검증:** `editor.js` JS 구문 파싱 및 제거 요청 문구 잔존 검사 통과. 마지막 변경 커밋의 GitHub CI 문법/Lint/타입/단위 테스트 성공. **Windows 설치 EXE 생성 및 실제 사용자 PC 렌더링은 아직 확인되지 않음.**
- **후속 개발은 지시 있을 때만:** 단축키 전환의 단축키1/2 별도 상태 아이콘 등 보류 항목을 이번에 구현하지 않음. 설명·레이아웃 의견만 요청받으면 코드·GitHub·빌드를 수정하지 않음.

## 2026-11-15 단축키 전환 속성창 정렬 / 상태별 아이콘은 후속 작업

- **이번 반영:** '단축키 전환' 속성창의 제목·단축키 1·단축키 2 필드 오른쪽 끝을 OFF/ON 고정 아이콘 박스 두 개의 합계 폭(약 404px)에 맞춤. 왼쪽 라벨 위치는 유지. 값 없는 '단축키 안내: 사용자 지정' 행 제거.
- **공통 제목 UI:** 글꼴 설정 T⌄ 버튼을 제목 입력 필드 내부 오른쪽에 표시하되 기존 글꼴 팝업 기능은 유지.
- **사용자 지정 후속 작업(이번에 구현하지 않음):** 단축키 전환 동작의 **단축키 1 실행 상태**와 **단축키 2 실행 상태**에 서로 다른 아이콘 등록·표시를 지원한다. 기존 전환 실행과 아이콘 설정을 보존하며, 향후 별도 구현 지시 후 작업.
- **검증 범위:** 자동 CI/Windows 빌드는 별도 확인. 사용자 PC 렌더링 테스트는 수행하지 않음.

## 2026-11-15 노브 누른 채 회전 액션 — 코드 반영 / 실기 미검증

- **구현:** 기존 노브별 동작 등록 화면에 '누른 채 왼쪽 회전'과 '누른 채 오른쪽 회전' 슬롯을 추가. 기존 일반 회전/누르기 및 트리거·조절·스택 모드 유지; 전역/페이지별 바인딩의 JSON 저장·마이그레이션에 `holdLeft`/`holdRight` 추가.
- **입력:** D200X HID 누름(1) → 회전(2/3) → 해제(0) 순서에서 누른 상태의 회전을 보조 액션으로 구분. 명시적인 state 4/5도 전달. 보조 액션이 설정된 노브에서 누름만 할 경우 해제 시 눌림 액션 실행, 누른 채 회전 시 눌림 액션과 일반 회전 중복 실행 방지. 기존 보조 액션 미설정 노브는 이전 입력 경로 유지.
- **프로필 이동:** 기존 '프로필 전환' 액션의 선택지에 '이전 프로필'을 추가해 누른 채 좌/우 회전에 이전/다음 프로필 각각 할당 가능. 프로필 전환 중에도 노브 누름 추적을 유지.
- **검사:** `deck-core.js`의 기본/보조 회전, 누름 이벤트, JSON 복원에 대해 현재 코드 직접 실행 확인; `test/streamdeck-core.test.cjs`에 회귀 테스트 추가. 편집기 JS 파싱 검사 완료. GitHub Actions 전체 빌드/테스트의 결과와 Windows/D200X 실물 입력은 별도로 확인해야 함.
- **주의:** Ulanzi SDK의 held-rotate 이벤트 명칭은 확인했지만, 현재 사용하는 직접 HID 전송에서 눌린 상태로 실제로 어떤 이벤트·flags가 도착하는지는 사용자 PC 실기에서 확인해야 한다. 기존 설치 및 프로필 변경 금지.

## 2026-11-15 DeckForge 1.0 설치 EXE 자동 빌드 통과

- 구현 커밋 `ee3401cd3048606ca112930b22a189c35fe5bcb5`.
- [DeckForge 1.0 Windows build #43699754327](https://github.com/SoonCheol/D200X-Deck/actions/runs/43699754327) **success**; CI `Check DeckForge installed-mode behavior` 통과, 기존 포터블 EXE/SDK/Fusion 호환 검사 통과, `electron-builder@26.0.12` NSIS 패키징 성공(로그: `oneClick=true perMachine=false`).
- **설치 파일** 아티팩트: `DeckForge-1.0-Setup-win-x64`, ID `14155877709` (아티팩트 ZIP 약 123,384,519바이트). 내부 `DeckForge-Setup-1.0.0.exe` 생성 확인(123,391,849바이트).
- 기존 포터블 EXE도 별도 아티팩트 `DeckForge-1.0-win-x64`로 보존. 설치형 이용 시 **Setup** 아티팩트를 선택한다.
- **실기 미확인:** Windows 설치 프로그램 실제 실행, 설치 위치·시작 메뉴·자동 로그인·트레이 유지·설치한 MCP 동작은 사용자의 Windows PC에서 확인이 필요하다. 자동 테스트 통과를 실기 검증으로 취급하지 말 것.

## 2026-11-15 DeckForge 설치형·트레이·내장 MCP 개발

- **설치형:** GitHub Actions에서 기존 포터블 실행 파일과 별도로 per-user Windows NSIS `DeckForge-Setup-1.0.0.exe` 생성. 관리자 권한을 요구하지 않는 기본 설치 경로 `%LOCALAPPDATA%\\Programs\\DeckForge\\DeckForge.exe`를 고정 (oneClick/perMachine=false). 업데이트할 때 같은 설치 프로그램을 재실행. **설치 위치를 사용자 정의하는 옵션 없음.**
- **트레이:** 로그인 후 자동 시작(설치형 앱에 한해 기본 ON), 창 닫기는 숨기기, D200X HID/플러그인 유지, 트레이 더블클릭으로 편집기 열기, 트레이에서 자동 시작 토글·새 빌드 확인·명시적 종료 지원. 진짜 Windows 서비스(LocalSystem)가 아니며 사용자 로그인 세션의 앱.
- **내장 MCP:** 별도 개발 체크아웃이나 Node 설치 없이 설치 디렉터리의 Electron(Node 24) 런타임으로 `resources\\mcp\\deckforge-mcp.cmd`를 실행. 패키지 내부 `resources\\mcp\\tools\\fusion-mcp\\server.cjs`와 `resources\\mcp\\app\\streamdeck-editor\\fusion-batch.js`를 함께 제공. 향후 업데이트에서도 MCP 실행 명령·경로 동일.
- **데이터 보존:** 이전 `%APPDATA%\\D200X StreamDeck Device Sync` userData를 계속 사용. 설치·덮어쓰기 과정에서 프로필·HA 토큰·SDK 플러그인 저장소 변경·삭제하지 않음. 제거해도 사용자 데이터 삭제 옵션 비활성.
- **업데이트:** 트레이 'GitHub에서 새 빌드 확인'에서 사용자가 최신 Actions 설치 EXE를 직접 받아 재설치하는 **명시적 승인 방식**. 자동 다운로드·무인 업데이트·새 버전 자동 감지는 구현하지 않았음. 설치 전에 현재 앱을 'DeckForge 종료'로 명시 종료하도록 안내.
- **검증 구분:** 단위검사와 GitHub 빌드는 Windows 설치·업데이트/사용자 PC 실기 검증을 대체하지 않음. NSIS 설치 실행과 로그인 자동 시작 및 Codex MCP 연결은 사용자 실기 확인 필요.

## 2026-11-15 DeckForge 1.0 브랜드 변경 및 Windows EXE 검증 성공

- **브랜드 변경 커밋:** `a750512a1405d9fadc1a5b3c703940d3d0cc7601`. 앱 표시명 **DeckForge 1.0**, 패키지 버전 **1.0.0**, 실행 파일 **`DeckForge.exe`**.
- **Windows 빌드:** [DeckForge 1.0 Windows build #43698785366](https://github.com/SoonCheol/D200X-Deck/actions/runs/43698785366) **success**; 로그에 `dist/DeckForge-win32-x64` 생성, `DeckForge.exe` 확인, 패키지 버전 확인, 내장 Node v24.22.1 확인. 기존 Autodesk Fusion 원본 플러그인 프로토콜 검증 단계도 통과.
- **추가 CI:** [CI #43698790843](https://github.com/SoonCheol/D200X-Deck/actions/runs/43698790843) **success**, [입력 검증 #43698785371](https://github.com/SoonCheol/D200X-Deck/actions/runs/43698785371) **success**.
- **다운로드:** Workflow run의 Artifacts → `DeckForge-1.0-win-x64` (ID `14154689045`, 170,373,903 bytes, 당시 미만료). ZIP 전체 압축 해제 후 `DeckForge.exe` 실행.
- **기존 데이터 보호:** 구 Windows 제품명 `D200X StreamDeck Device Sync`에 대응하는 기존 `userData` 경로를 재사용하도록 명시. 실제 사용자 PC에서 구 프로필·기존 플러그인 재인식 및 창 제목은 다음 사용자 실행에서 확인 필요. 구 EXE는 삭제하지 않으며 저장소 이름 및 `main` 브랜치 변경 없음.

## 2026-11-15 제품명·공식 버전 확정 — DeckForge 1.0

- **사용자 확정:** 제품명 **DeckForge**, 사용자 표시 버전 **1.0**, 앱·빌드 메타데이터 버전 **1.0.0** (SemVer).
- **적용 지점:** `app/streamdeck-editor/index.html` 창 제목, `main.cjs` Electron 창 제목, `app/streamdeck-editor/package.json`, Windows GitHub Actions 패키지 메타데이터, 실행 파일 **`DeckForge.exe`**, Artifact **`DeckForge-1.0-win-x64`**.
- **데이터 보존:** 이름이 바뀌어도 구버전의 Electron 사용자 데이터 디렉터리 `%APPDATA%\\D200X StreamDeck Device Sync`를 그대로 사용하도록 `app.setPath('userData', ...)`를 단일 인스턴스 잠금 이전에 명시. 기존 프로필(localStorage), 플러그인 폴더, HA 인증 및 불러오기 위치 정보 유지. 데이터 이동·복사·삭제 없음.
- **범위:** 새 D200X 전용 편집기와 전용 Windows 빌드만 변경. GitHub 저장소 `SoonCheol/D200X-Deck`, 개발 브랜치 `codex/streamdeck-761-clean-editor`, 기존 Ulanzi Deck Open 메인 앱/릴리스 빌드, 이미 생성된 자료의 역사적 이름은 유지.
- **검증:** 빌드 결과가 성공일 때만 완료로 기록하며 새 이름으로 사용자 GUI를 직접 실행한 실기는 별도.

## 2026-11-15 Fusion MCP 일괄 등록 1차 구현·Windows 빌드 검증 완료

- **기능 커밋:** `c3035724c8b8165dbb26ce0c3513339638d8cf3b`. **와이드 슬롯 보호 수정:** `de8e7fb1113de684bd7b3a7f76ad4c045a6b59bc` (13개 일반 버튼/페이지, wide index 13에 액션 등록 없음).
- **검증:** [Windows Actions #43697835588](https://github.com/SoonCheol/D200X-Deck/actions/runs/43697835588) **success**. 추가된 Fusion MCP 테스트 6개 통과(명령 목록 조회 모의 통신·독립 프로필 만들기·기존 할당 보존·페이지 분할·잘못된 JSON 거부·MCP 도구 발견). 기존 SDK/Fusion 원본 호환 자동 검증 유지.
- **Windows EXE:** `D200X-StreamDeck-Device-Sync-win-x64` Artifact ID `14155193200`, 170,373,818 bytes (조회 당시).
- **MCP 사용:** `tools/fusion-mcp/server.cjs` 로컬 stdio 서버; `fusion_list_commands` 및 `fusion_export_batch`. 생성 JSON은 D200X 편집기에서 **전체 프로필 관리 → Fusion 360 명령 일괄 등록 JSON 가져오기**로 가져오며 기존 프로필은 그대로 유지한다.
- **자동화 수준:** Codex가 실제 Fusion 애드인이 보고한 명령을 선택 또는 전체 내보내어 새 프로필을 생성하는 JSON 파일까지 자동 작성. 가져오기는 사용자 명시 클릭 1회. **사용자 PC에서 Codex MCP 등록과 Fusion 라이브 조회, 앱 GUI 실제 가져오기 테스트는 아직 하지 않음.**
- **다음:** PC에서 신규 Windows EXE 실행 → 프로젝트 최신 코드 확보 → MCP 등록 → Fusion 명령 조회 → JSON 생성 → GUI에서 새 프로필 가져오기·버튼/아이콘 검증. 원본 FusionStreamDeck 플러그인과 기존 HA 설정은 수정하지 않는다.

## 2026-11-15 배치 배치 위치 정정 — 와이드 화면 보호

- D200X의 물리 키 배치는 페이지당 **일반 버튼 13개 + 와이드 정보 화면 1개**이며, 사용자가 와이드에는 액션이 등록되지 않도록 명시적으로 요청했다.
- MCP 생성 JSON의 버튼 배치를 **13개 일반 키/페이지**로 정정. slot 13은 항상 비움. 기존 프로필 및 와이드 설정은 어떤 경우에도 변경하지 않는다.
- 128페이지 기준 최대 1,664개 명령. 관련 테스트에 와이드 slot 13이 null인지 검증 추가.

## 2026-11-15 Fusion MCP 1차 자동 검증 및 Windows 빌드 성공

- **구현 커밋:** `c3035724c8b8165dbb26ce0c3513339638d8cf3b`: Fusion 애드인 실제 명령 ID 조회·MCP stdio 도구 2개·선택 또는 전체 명령의 일괄 JSON 생성·D200X 편집기에 기존 프로필을 유지하며 **새 Fusion 전용 프로필로 가져오기** 구현.
- **테스트 편입:** `28276f0373828e1cb783fd489f0abc386fc290fc`: Windows workflow에 `test/streamdeck-fusion-mcp.test.cjs` 6개 테스트 및 MCP 문법 검사 추가.
- **검증 증거:** [GitHub Actions #43697585224](https://github.com/SoonCheol/D200X-Deck/actions/runs/43697585224) **success**. 해당 작업 로그에서 **Fusion MCP 테스트 6개 통과, 실패 0**, 기존 Windows 패키징·원본 Fusion 플러그인 SDK 통신 단계도 성공.
- **Windows 빌드 Artifact:** `D200X-StreamDeck-Device-Sync-win-x64`, ID `14154958192`, 170,373,787 bytes, 확인 당시 미만료.
- **적용 방법:** Codex MCP 등록은 `tools/fusion-mcp/README.md`; Codex로 생성된 JSON을 앱의 **프로필 메뉴 → 전체 프로필 관리 → Fusion 360 명령 일괄 등록 JSON 가져오기**에서 선택. 기존 설정을 자동 수정하거나 덮어쓰지 않음.
- **미검증:** 사용자 컴퓨터의 Codex CLI에 실제 MCP 등록, 실시간 `GET /commands` 수신, 생성 JSON 앱 UI 가져오기, 여러 페이지에서 원본 아이콘 자동 갱신은 아직 실기 전. 실제 Fusion 명령 한 건의 D200X 실행 성공은 사용자 보고로 이미 확인됨.
- **기능 제약:** 현재 Fusion에서 로드된 작업 공간 명령만 가져오며, 명령별 기능을 수동 선택하지 않고 모두 등록할 수 있지만 최대 1,664개(13개 일반 버튼/페이지 × 128페이지) 제한. 사용자 기존 프로필 무손실 보존 우선.

## 2026-11-15 Fusion 명령 일괄 등록 MCP 1단계 코드 반영

- **목표:** Codex MCP로 실행 중인 Fusion 애드인의 `GET /commands`를 읽어 실제 명령 ID를 일괄 확인하고, D200X의 기존 프로필을 보존하면서 새 Fusion 전용 프로필에 14개/페이지로 버튼을 배치할 JSON 생성.
- **추가:** `tools/fusion-mcp/server.cjs`(stdio JSON-RPC MCP 도구 2종), `app/streamdeck-editor/fusion-batch.js`(파일 검증·새 프로필만 추가), `test/streamdeck-fusion-mcp.test.cjs`, `tools/fusion-mcp/README.md`.
- **앱:** 프로필 메뉴 > 전체 프로필 관리 > Fusion 360 명령 일괄 등록 JSON 가져오기. 기존 전체 프로필 JSON 교체와 달리 사용자 확인 후 새 프로필 생성; 기존 프로필·키·HA 플러그인 보존.
- **실기 분리:** 이 커밋에서는 로컬 Codex MCP 설치·Fusion 실제 명령 목록·GUI 일괄 등록 성공을 주장하지 않는다. Windows Actions 테스트 결과를 별도로 확인해야 한다.
- **개발 브랜치:** `codex/streamdeck-761-clean-editor`만 사용. `main` 변경 금지.

# D200X-Deck 최신 기능 현황 — 단일 상태 기준

> **기준:** 2026-11-15 · 저장소 `SoonCheol/D200X-Deck` · 개발 브랜치 `codex/streamdeck-761-clean-editor` · 코드 커밋 `c738f16095996d64b2dd8b215515743fba299390` · 직전 HEAD(문서) `6c663193e6e81201c27e9ebbe282f47b58392da1`.
> **이 문서가 최신 구현·검증 상태의 단일 기준이다.** 이전 로드맵·인수인계서의 날짜별 진행 문단과 체크박스는 **당시 기록**으로만 읽는다. 기능별 판정은 최신 코드·GitHub 검증·사용자의 실제 장치 보고를 구분한다.
> 이번 정리는 **문서만 수정**하며 코드를 실행하거나 실물 Windows/D200X를 새로 테스트하지 않았다. 기존 자동 CI/EXE 성공을 실기 성공으로 간주하지 않는다.

## 상태 정의

- **명시적 미구현:** UI에서 비활성화되었거나 실행 경로가 아직 없는 기능.
- **부분 구현:** 일부 동작·옵션은 구현되었지만 알려진 세부 요구나 원본 호환 범위가 남은 기능.
- **코드 구현·실기 미검증:** 코드 및 기존 기록상 실행 경로가 있으며 실제 Windows GUI/USB/앱별 결과는 확인하지 못한 기능.
- **사용자 실기 확인:** 사용자가 특정 조건·버전에서 작동을 확인한 경우에만 기록. 모든 모드의 통과를 뜻하지 않음.

## 2026-11-15 즉시 정정: 플러그인 탭의 실행 시 활성화 확인

- 이전 현황표에서 **플러그인 탭을 미구현으로 분류한 것은 오류**였다. `index.html`의 초기 disabled만 보고 결론을 내린 것이 원인.
- 실제 `app/streamdeck-editor/editor.js` 초기화는 `tabs[1].disabled=false`로 버튼을 켜며, `libraryTab='plugins'`, `installSdkPlugin()`, `renderInstalledSdkPlugins()`, `data-sdk-inspector`와 `main.cjs`의 SDK IPC가 로컬 플러그인 사용 흐름을 제공한다.
- **사용자는 플러그인 탭을 실제로 사용 중이라고 확인**했다. 따라서 탭 자체와 로컬 설치를 '미구현' 목록에 다시 넣지 않는다.
- 한계는 **Node.js 실행형 플러그인, 네이티브 실행형 플러그인, 온라인 마켓플레이스의 별도 지원 여부**다. HTML 실행형 호스트가 있다는 사실과 모든 SDK 플러그인과의 호환성을 혼동하지 않는다.
- **재발 방지:** 정적 HTML의 disabled, placeholder, 오래된 주석만으로 실행 상태를 판정하지 않고 렌더러 초기화, 이벤트 핸들러, IPC, 실행 호스트, 최신 실사용 피드백을 함께 확인한다. 2026-11-15 전체 코드 경로 재감사 결과는 아래 '코드 경로 재검증' 절을 따른다.

**사용자 결정 (2026-11-15): `Virtual Stream Deck`은 미구현 작업 대상이 아니라 **개발 보류** 항목으로 관리한다. 현재 비활성 표시를 유지하며, 사용자가 명시적으로 개발 재개를 지시하기 전에는 구현하거나 미완성 우선 개발 목록에 넣지 않는다.**

## 최신 UI 메뉴·프로필·장치 현황

| 메뉴·기능 | 현재 상태 | 남은 작업 또는 검증 |
|---|---|---|
| 오른쪽 상단 설정 ⚙ | **명시적 미구현** | `index.html`에서 disabled. 설정 화면/항목 설계 및 구현 |
| 오른쪽 플러그인 탭 | **코드 구현·사용자 실사용 확인** | `index.html`의 초기 disabled를 `editor.js` 초기화에서 `tabs[1].disabled=false`로 해제. 플러그인 탭·로컬 설치·목록·액션 등록 기능 존재. 사용자 실제 사용 보고 |
| 액션 검색·카테고리·드래그 등록 | **코드 구현·실기 미검증** | 카탈로그 `action-panel-icons.js`, `editor.js`의 실제 GUI 확인 |
| 프로필 생성·복제·이름 변경·삭제·전환 | **코드 구현·실기 미검증** | `editor.js`, `deck-core.js`의 장치·저장 복원 회귀 |
| 전체 프로필 JSON 내보내기/가져오기 | **코드 구현·실기 미검증** | 최근 `editor.js`의 가져오기/사전 백업 경로 실기 확인. 과거 문서의 '가져오기 미구현'은 오래된 설명 |
| 원자적 디스크 저장·스키마 버전 관리 | **명시적 미구현** | 기존 localStorage 기반 모델과 기존 프로필 무손실 이관 전제 |
| Smart Profile | **부분 구현** | 코드상 자동 전환·기본 복귀 경로 존재. 전경 앱 조회/권한·최소화 조건 실기 확인; 과거 '기본 복귀 미구현' 문구 재검토 필요 |
| 폴더·고정 키·페이지 | **부분 구현** | 최대 8단계 폴더, 10페이지 신규 제한, 고정 상속 지원. 원본/상속본 실시간 공유 및 액션별 Auto Exit 예외 미완성 |
| LCD 버튼 우클릭·복사·붙여넣기·불러오기·내보내기·삭제 | **코드 구현·실기 미검증** | `editor.js`에 조건부 메뉴 존재. 원본 모든 상태별 메뉴 일치 여부/최신 삭제 공통 경로 확인 |
| 아이콘 라이브러리 | **부분 구현** | Fluent UI Regular/Filled 내장, 외부 팩 가져오기·삭제, 간이 아이콘 제작. 대용량/포맷 제한과 원본 고급 에디터 미완성 |
| 물리 버튼 2개·노브 누름 우클릭 삭제 | **코드 구현·실기 미검증** | `c738f160`까지 반영. 물리 버튼 2개·노브 3개 및 속성창 삭제 일관성 최신 EXE 재검증 |
| 와이드 버튼 화면 순환·4개 정보 모드 | **부분 구현 + 사용자 실기 일부 확인** | CPU/RAM/GPU 겹침은 해결 확인. 통계 네이티브 화면에서 1회 입력으로 다음 모드 이동하는 최신 수정은 재검증 필요 |
| 와이드 버튼 일반 액션 등록 차단 | **코드 구현·실기 미검증** | 최신 코드의 드래그·붙여넣기·루트/폴더 경로 실기 검증 |
| Windows/D200X 연결·빠른 노브 회전·USB 재연결 | **부분 구현** | 사용 중 연결 안정 사례는 있으나 급회전·장시간 유휴·실제 복원은 별도 실측 필요 |
| 화면/제목/글꼴·색상·PNG 반영 | **코드 구현·실기 미검증** | 원본 7.6.1 GUI 일치·디스플레이 배율 검증 필요 |

## 오른쪽 액션 카탈로그 현재 상태

카탈로그 그룹 정의는 `app/streamdeck-editor/action-panel-icons.js`가 제어한다. 정의된 ID **43개 = Stream Deck 기본 24개 + D200X 확장 18개 + 레거시 HA 1개**다. 단, 실제 **액션 탭 렌더링에서 레거시 HA 카테고리를 건너뛰므로 42개가 표시되며**, 그중 `virtual` 1개는 비활성화된다. 설치된 SDK 플러그인은 **별도의 작동 중인 플러그인 탭**에서 동적으로 표시하고, 저장 모델에서는 `sd-plugin` 유형을 사용한다. 따라서 '43개 모두 액션 탭에 표시'라고 해석하지 말 것.

| 분류 | ID | 표시 기능 | 현재 상태 | 잔여 확인/제약 |
|---|---|---|---|---|
| Soundboard | `audio-play` | 오디오 재생 | 코드 구현·실기 미검증 | 페이드 1~5초, 출력 장치 선택 코드 있음; 실제 청감/출력 장치 확인 필요 |
| Soundboard | `audio-stop` | 오디오 정지 | 코드 구현·실기 미검증 | 중복 재생·동시 오디오 시나리오 확인 필요 |
| Stream Deck | `timer` | 타이머 | 코드 구현·실기 미검증 | 완료 음·잔여 시간 표시 구현; 실제 기기 갱신 간격 확인 필요 |
| Stream Deck | `brightness` | 밝기 | 코드 구현·실기 미검증 | 장치 밝기 단계 및 경계 실측 필요 |
| Stream Deck | `sleep` | 잠자기 | 코드 구현·실기 미검증 | D200X 화면 잠자기/깨우기 실측 필요 |
| Stream Deck | `virtual` | Virtual Stream Deck 토글 | **사용자 지시로 개발 보류** | 현재 목록 표시만, 클릭·드래그 등록 비활성. 사용자 별도 재개 지시 전 구현 대상·우선순위에서 제외 |
| 다중 동작 | `multi` | 다중 동작 | 부분 구현 | 하위 동작·지연·중단 지원; 모든 조합과 원본 일치 미확인 |
| 다중 동작 | `multi-switch` | 다중 동작 스위치 | 부분 구현 | 상태별 동작·제목·아이콘 지원; 복원·실물 전환 검증 필요 |
| 다중 동작 | `random` | 무작위 동작 | 부분 구현 | 후보 편집 및 무작위 실행; 지원 하위 액션 범위 제한 |
| 다중 동작 | `logic` | Key Logic | 부분 구현 | single/double/hold 분기 코드; 물리 입력 타이밍·조합 미확정 |
| 시스템 | `website` | 웹사이트 | 부분 구현 | 기본/GET/지정 브라우저 HTTP(S) 지원; 커스텀 URI 미지원 |
| 시스템 | `hotkey-switch` | 단축키 전환 | 코드 구현·실기 미검증 | 대상 앱·포커스·상태 전환 실측 필요 |
| 시스템 | `hotkey` | 단축키 | 부분 구현 | 직접 지정과 Windows 프리셋 지원; 원본 전체 프리셋·동적 검색 없음 |
| 시스템 | `open` | 열기 | 코드 구현·실기 미검증 | Windows 파일·폴더/앱 처리 실측 필요 |
| 시스템 | `open-app` | 응용 프로그램 열기 | 부분 구현 | 약 650ms 길게 누르기 종료·전경 전환 코드; 원본 타이밍/Windows 포커스 미확정 |
| 시스템 | `close` | 닫기 | 코드 구현·실기 미검증 | 경로 일치 프로세스 종료·권한 조건 확인 필요 |
| 시스템 | `text` | 텍스트 | 코드 구현·실기 미검증 | 유니코드 직접 입력·클립보드 Ctrl+V 지원; 대상별 확인 필요 |
| 시스템 | `media` | 멀티미디어 | 코드 구현·실기 미검증 | 플레이어·미디어 키 동작 확인 필요 |
| 탐색 | `folder` | 폴더 생성 | 부분 구현 | 다단계 폴더·자동 종료 지원; 액션별 자동 종료 예외 미구현 |
| 탐색 | `profile` | 프로필 전환 | 코드 구현·실기 미검증 | 프로필별 상태 보존·실물 전환 확인 필요 |
| 탐색 | `previous` | 이전 페이지 | 코드 구현·실기 미검증 | 이전 보정 코드 있음; 최신 EXE 회귀 검증 필요 |
| 탐색 | `next` | 다음 페이지 | 코드 구현·실기 미검증 | 반복 누름·페이지 경계 확인 필요 |
| 탐색 | `goto` | 페이지로 이동 | 코드 구현·실기 미검증 | 대상 페이지 설정·복원 확인 필요 |
| 탐색 | `indicator` | 페이지 표시기 | 코드 구현·실기 미검증 | 화면 표시 전용이며 실행 액션 아님 |
| D200X 추가 | `system-volume` | Windows 음량 조절 | 코드 구현·실기 미검증 | 단계량·노브 회전 Windows 실제 확인 필요 |
| D200X 추가 | `system-mute` | Windows 음소거 | 코드 구현·실기 미검증 | 음소거 상태 전환 확인 필요 |
| D200X 추가 | `system-scroll` | Windows 스크롤 | 코드 구현·실기 미검증 | 가로·세로/단계량 실측 필요 |
| D200X 추가 | `edit-history` | 실행 취소·다시 실행 | 코드 구현·실기 미검증 | Ctrl+Z/Y 대상 앱 포커스 확인 필요 |
| D200X 추가 | `window-switch` | 창 전환 | 코드 구현·실기 미검증 | Alt+Tab 동작 확인 필요 |
| D200X 추가 | `desktop-switch` | 가상 데스크톱 전환 | 코드 구현·실기 미검증 | Windows 가상 데스크톱 확인 필요 |
| D200X 추가 | `device-brightness` | D200X 화면 밝기 | 코드 구현·실기 미검증 | 20~100% 보호·노브 조절 실측 필요 |
| D200X 추가 | `system-zoom` | 화면 확대·축소 | 부분 구현 | 고정 키 조합 기반, 앱별 차이 |
| D200X 추가 | `screenshot` | 화면 캡처 | 코드 구현·실기 미검증 | Windows 캡처 결과 확인 필요 |
| D200X 추가 | `clipboard-edit` | 클립보드 편집 | 코드 구현·실기 미검증 | 복사·붙여넣기·잘라내기 대상별 확인 필요 |
| D200X 추가 | `window-state` | 창 상태 | 코드 구현·실기 미검증 | 최대화·최소화·복원 확인 필요 |
| D200X 추가 | `window-monitor` | 다른 모니터로 이동 | 코드 구현·실기 미검증 | 다중 모니터 환경 확인 필요 |
| D200X 추가 | `explorer-open` | 파일 탐색기 열기 | 코드 구현·실기 미검증 | Windows 동작 확인 필요 |
| D200X 추가 | `brush-size` | 브러시 크기 | 부분 구현 | 고정 단축키 기반, 앱별 키맵 미완성 |
| D200X 추가 | `timeline-step` | 타임라인 이동 | 부분 구현 | 화살표 단축키 기반, 앱별 키맵 미완성 |
| D200X 추가 | `timeline-zoom` | 타임라인 확대 | 부분 구현 | Ctrl +/− 기반, 앱별 키맵 미완성 |
| D200X 추가 | `file-open` | 지정 파일 열기 | 코드 구현·실기 미검증 | 대상 파일·연결 앱별 확인 필요 |
| D200X 추가 | `folder-shortcut` | 지정 폴더 열기 | 코드 구현·실기 미검증 | 탐색기 및 경로 실측 필요 |
| 플러그인(레거시, 액션 탭 숨김) | `ha-toggle` | HA 장치 켜기/끄기 | 기존 저장 설정용 코드 보존 | `editor.js`의 `renderLibrary`가 레거시 HA 카테고리를 숨긴다. 기존 프로필 실행 경로는 남겨둠. 현재 사용자 플러그인 탭의 SDK HA 액션과 구별 |
| 플러그인 | `sd-plugin` | Stream Deck SDK 플러그인 | **HTML 실사용 확인 + Node.js 실행 코드 구현·실기 미검증** | HTML SDK/HA 기존 기능 유지, `.js/.cjs/.mjs` 플러그인 프로세스·통신, 개발자 `.sdPlugin` 폴더 설치 및 원본 PI 지원 코드. Fusion 실제 설치·명령 실행 및 다른 플러그인은 별도 검증 |

## 2026-11-15 원본 Autodesk FusionStreamDeck 플러그인 자동 호환성 검증 성공

- **코드 커밋:** `1cfc6a43f6c50cdb779662409f1a2ea6ba6ab73b` — 외부 원본 플러그인의 **수정 없는** SDK 통신 검증을 GitHub Actions Windows 패키징에 추가. 상위 리포지터리 [AutodeskFusion360/FusionStreamDeck](https://github.com/AutodeskFusion360/FusionStreamDeck)의 커밋 `bc153b8cddedba91614f932f4210f1ecb451c2a8`을 고정 사용(소스 저장소에 복제하지 않고 CI에서 별도 체크아웃).
- **자동 검사:** [Windows Preview #43689297460](https://github.com/SoonCheol/D200X-Deck/actions/runs/43689297460) **success**. 해당 run 로그의 'Unmodified Autodesk FusionStreamDeck Node24 plugin speaks D200X SDK WebSocket' **1개 테스트 통과, 실패 0**. 기존 패키징된 Electron Node24 SDK 통합 테스트도 통과. [CI #43689301936](https://github.com/SoonCheol/D200X-Deck/actions/runs/43689301936) **success**.
- **실제 확인된 내용:** Fusion 원본 `.sdPlugin` 폴더 설치 및 manifest 액션 인식 → 원본 `bin/plugin.js`를 **패키징된 Electron Node 24 실행기**로 시작 → SDK WebSocket 등록 → D200X 호스트의 `keyDown` 수신 → Fusion 애드인 부재 상황에서 원본의 `showAlert` 응답 → `sendToPlugin` 검색 요청에 대해 원본이 `sendToPropertyInspector/searchError`를 보내고 D200X 호스트가 속성 편집기 소켓으로 전달하는 경로.
- **빌드:** Artifact `D200X-StreamDeck-Device-Sync-win-x64` ID `14151338602`, 170,372,503 bytes, 확인 당시 `expired=false`.
- **검증되지 않은 것:** 실제 Fusion 360 설치/애드인 HTTP 서버 연결, `extrude` 실제 명령 실행, Fusion 정상 연결에서 명령 목록·아이콘 표시, 실제 PI GUI, 물리 D200X 버튼/노브. 따라서 **'Fusion 플러그인 완전 호환'으로 표시하지 않는다**.
- **다음 단계:** Windows 실제 Fusion 360/애드인과 D200X에서 기능 실기. 다른 무료 공개 Stream Deck 플러그인도 SDK 이벤트/manifest 차이 검토 후 지원 범위 확대. 기존 HTML·HA 플러그인 및 프로필 보존.

## 2026-11-15 Node.js 플러그인 호스트 자동 검증 완료 — 실기와 구분

- **현재 기능 커밋:** `c38b50d8742325d8b79df7b06e94c95d148ce8cc` (Node.js 호스트·폴더 설치·SDK 통신·Windows 검증 워크플로; 기존 HTML/HA 보존).
- **CI:** [#43688950761](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688950761) **success**.
- **Windows 패키징/SDK 통합:** [#43688944909](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688944909) **success**. 실제 Windows GitHub Actions 실행 환경에서 완성된 `D200X-StreamDeck-Preview.exe`를 `ELECTRON_RUN_AS_NODE=1`로 실행하여 **Node v24.22.1** 확인. 해당 EXE를 테스트 플러그인의 실제 Node 실행기로 지정하여 **SDK 테스트 12개 통과, 실패 0**(매니페스트/ZIP/폴더 가져오기, HTML/HA 호환용 모의 테스트, Node 프로세스·WebSocket 등록·키 입력 테스트 포함).
- **Windows ZIP Artifact:** `D200X-StreamDeck-Device-Sync-win-x64`, ID **14151905591**, 170,372,503 bytes, 확인 당시 `expired=false`(일시적 보관).
- **정확한 검증 한계:** 실제 Autodesk FusionStreamDeck 원본 `bin/plugin.js`를 Windows EXE에서 설치·실행하는 시험은 아직 하지 않았고, Fusion 360 Python 애드인·Property Inspector 검색·물리 D200X 버튼 실기는 미확인. 현재 테스트 Node 플러그인은 **모의 구현**. 모든 상용/네이티브/DRM Stream Deck 플러그인의 호환을 의미하지 않음.
- **실패 및 재수정 기록:** Actions #43688432536 (YAML step 생성 오류), #43688638822 (루트·app 상대 경로 오류), #43688783937 (첫 테스트 경로 오류)를 수정하여 최종 #43688944909 success 달성. 오류 원인과 커밋별 기록은 [전용 인수인계](D200X-NODE-PLUGIN-HANDOFF-20261115.md)에 남김.
- **다음 순서:** 원본 Fusion 플러그인 샘플을 통한 WebSocket/PI/아이콘 검증 강화 → 필요 시 SDK 호환 이벤트 추가 → 사용자 PC에서 Fusion 실제 명령·D200X 실기. 기존 사용자 데이터·HTML/HA 설정은 무손실 보존.

## 2026-11-15 Node.js 호스트 단계별 실행 기록

- **1차 코드 커밋:** `0499bf2164a65af10ea5524a1fd01c5434993861`. HTML 전용 매니페스트 검증을 HTML·Node.js로 확장, Node 런타임 버전 체크, Electron 포함 Node 실행환경에 원본 SDK 인수로 독립 프로세스 시작, WebSocket 연결, 프로세스 종료 처리 및 Fusion manifest 단위 테스트 추가.
- **CI:** [#43687825178](https://github.com/SoonCheol/D200X-Deck/actions/runs/43687825178) 성공. **Windows 패키징:** [#43687820764](https://github.com/SoonCheol/D200X-Deck/actions/runs/43687820764) 성공. 성공은 앱 실행/실물 호환성의 증거가 아닌 자동 빌드 결과.
- **2차 코드 커밋:** `f7207e8fe5a03fbe4704cc30cac8b274dcb18ab2`. `.sdPlugin` 개발자 폴더 안전 설치, `127.0.0.1` SDK 서버, 실제 Node 하위 프로세스 + WebSocket 등록 + 물리 키 입력 모의 통합 테스트. 기존 HTML manifest 테스트 유지.
- **2차 CI:** [#43688058250](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688058250) 성공, [D200X 입력 검증 #43688053891](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688053891) 성공, [Windows EXE #43688053882](https://github.com/SoonCheol/D200X-Deck/actions/runs/43688053882) 성공. Windows Artifact `14151515746`, 170,372,386 bytes, 당시 미만료. **이 테스트는 모의 Node 플러그인으로 진행됐으며 Autodesk Fusion 실제 명령 실행을 입증하지 않는다.**
- **3차 진행:** Windows 패키지에서 Electron의 Node 24 실행 자체를 검증하는 Actions 단계 추가; 저장된 Node 플러그인 프로세스 종료 후 다음 동기화에서 재시작하도록 보완.
- **단독 인수인계:** [D200X-NODE-PLUGIN-HANDOFF-20261115.md](D200X-NODE-PLUGIN-HANDOFF-20261115.md)

## 2026-11-15 개발 시작 기록 — Node.js SDK 호스트 1단계

- **목표:** Elgato 공식 SDK 규약으로 기존 Stream Deck Node.js 플러그인 실행. 첫 호환성 시험 대상은 Autodesk FusionStreamDeck. 특정 제조사 전용 코드는 넣지 않는다.
- **변경 예정 코드:** `sd-plugin-host.cjs`에 HTML 이외의 `.js/.cjs/.mjs` CodePath, Node 런타임 버전 검증, Electron 내장 Node 기반 독립 플러그인 프로세스, 기존 SDK WebSocket 등록 공유, 종료 정리 추가. `test/streamdeck-sdk-host.test.cjs`에 Fusion manifest/ZIP/버전 검증 추가.
- **지켜야 할 범위:** 기존 HTML/HA 경로와 사용자 설정은 유지; native/DRM/Marketplace 호환은 별개. 설치 시 실행되지 않고 버튼에 등록되어 `ensure`할 때만 실행한다.
- **주의:** 첫 커밋은 **코드 경로 구현**이며 Windows EXE에서 Node 24 실행, Fusion 실제 명령, 원본 Property Inspector 실기는 아직 확인 전이다. `ELECTRON_RUN_AS_NODE` 기본 fuse에 의존하므로 빌드 후 런타임 확인 필요.
- **진행 기록 규칙:** 이후 커밋별 CI 결과·실패/수정·소스 SHA를 이 절 아래 덧붙인다. 사용자 PC 전원을 요구하지 않으며 사용자 실기 요청 전까지 원격에서 가능한 범위만 처리한다.

## 2026-11-15 사용자 최종 목표 정의 — Stream Deck 플러그인을 D200X에서 그대로 사용

> **최우선 제품 목표:** Stream Deck용 기존 플러그인을 D200X 편집기의 플러그인 탭에 원본 형태로 등록하고, D200X 물리 버튼·노브로 실행·설정·상태·이미지까지 동작하도록 하는 범용 호환 호스트 구축. Autodesk FusionStreamDeck은 첫 호환성 시험 대상이며 Fusion 전용 개발이 목표가 아니다.

- **공식 참조 기준:** [Elgato Stream Deck SDK 공개 소스](https://github.com/elgatosf/streamdeck), [Manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest/), [WebSocket 플러그인 등록](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/), [플러그인 환경/생명주기](https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/). 비공개 Stream Deck 데스크톱 앱 내부 구현이 공개됐다고 전제하지 않는다.
- **호환 구현 범위:** 원본 Stream Deck 플러그인의 manifest, CodePath, Nodejs.Version, Action UUID, WebSocket 이벤트, Property Inspector, 설정/상태 저장, 동적 이미지/제목, 키·노브 입력, 실행·종료·복구 계약을 D200X에 연결한다. Fusion 전용 하드코딩 및 원본 플러그인 수정은 기본 전략에서 제외한다.
- **기존 기능 보존:** 현재 사용 중인 플러그인 탭, HTML CodePath 호스트, Home Assistant 플러그인, 버튼·노브·프로필·아이콘을 유지하며 필요한 경우 HTML/Node 실행기를 분기한다.
- **첫 검증 대상:** [AutodeskFusion360/FusionStreamDeck](https://github.com/AutodeskFusion360/FusionStreamDeck). 매니페스트 CodePath=bin/plugin.js, Nodejs.Version=24, SDKVersion=2, PropertyInspectorPath=ui/run-command.html. 실제 Fusion 명령 실행에는 별도의 Fusion Python 애드인이 필요하다.
- **구현 단계:** (1) 공식 SDK/예제와 기존 호스트 차이 분석, (2) 매니페스트·패키지 설치·Node 프로세스, (3) WebSocket/Property Inspector/설정/이미지, (4) D200X 버튼·노브 연동, (5) 원본 Fusion 플러그인 등록과 실제 Fusion 명령 검증, (6) HTML·HA·프로필 회귀 검사.
- **완료 판정:** 코드/CI, Windows EXE, 실제 D200X와 Fusion 실행을 분리한다. 한 플러그인 성공을 모든 Stream Deck 플러그인 호환성 확보로 과장하지 않는다. 네이티브 플러그인과 미지원 컨트롤러는 후속 확장으로 구분한다.
- **현 상태:** 목표/기준 확정. Node.js 지원 코드는 아직 미구현. 개발 실행·빌드는 별도 요청 시 진행.

## 2026-11-15 사용자 지정 Node.js 플러그인 호환성 목표 — Autodesk FusionStreamDeck

> **상태: 목표 확정 / 구현 미착수.** 사용자가 직접 지정한 첫 Node.js 플러그인 호환성 검증 대상은 [AutodeskFusion360/FusionStreamDeck](https://github.com/AutodeskFusion360/FusionStreamDeck)이다. 이 항목은 기존 24개 기본 액션이나 현재 사용 중인 HTML 기반 SDK 플러그인 기능을 대체하는 작업이 아니다. 사용자 별도 구현 지시가 있을 때만 코드를 수정한다.

- **정확한 대상:** `com.autodesk.fusionstreamdeck.sdPlugin` (`manifest.json`의 `UUID: com.autodesk.fusionstreamdeck`, `CodePath: bin/plugin.js`, `Nodejs.Version: "24"`, `SDKVersion: 2`, `PropertyInspectorPath: ui/run-command.html`).
- **목표 원칙:** Fusion 전용 하드코딩이 아니라 **범용 Stream Deck Node.js 실행 호스트를 추가**하고 Autodesk Fusion의 `Run Command` 액션을 첫 실사용 호환성 목표로 검증한다.
- **기존 기능 보존:** 현재 플러그인 탭의 HTML CodePath 설치·실행, HA 플러그인, 등록 액션/프로필/아이콘, 노브·물리 버튼·와이드 화면 기능을 변경 없이 보존한다.
- **개발 시 확인할 요소:** Node 24 런타임 실행/패키징, 독립 플러그인 프로세스와 생명주기, 기존 WebSocket SDK 등록 및 `keyDown` 이벤트, HTML Property Inspector의 설정 검색·선택, `setImage` 등 상태 업데이트, 장애·종료 처리, 설치/압축 검증, 이전 HTML 호환성.
- **실사용 완료 기준:** (1) Autodesk 플러그인 등록 및 `Fusion 360 / Run Command` 표시, (2) 액션을 D200X 버튼에 배치·저장·복원, (3) 원본 Property Inspector에서 Fusion 명령 검색·선택, (4) 실제 Fusion 명령 실행, (5) 해당 명령 아이콘 및 오프라인 표시/복귀 확인, (6) 기존 HTML/HA 플러그인 회귀 없음. 테스트/CI 성공과 실제 Windows/Fusion/D200X 실기는 구분해서 기록한다.
- **별도 전제:** 이 저장소 README에 따르면 플러그인뿐 아니라 **Fusion 360 내부에서 동작하는 `FusionStreamDeck` Python 애드인도 설치·실행**해야 한다. 애드인 없이 플러그인 호스트만 추가해서 실제 명령이 실행된다고 주장하지 않는다.
- **패키징 확인:** 프로젝트 README는 개발자용 `.sdPlugin` 폴더 복사 절차를 안내한다. D200X 기존 설치 UI가 `.streamDeckPlugin`/ZIP을 받는 방식과 차이가 있으므로 **정확한 설치 파일 준비 또는 지원 확장 필요 여부를 먼저 검증**한다.
- **범위 한계:** 이 단계의 목표는 Node.js 플러그인 호환성이지 모든 SDK 플러그인/네이티브 플러그인 지원을 약속하는 것이 아니다. 현재 다중 동작 안의 SDK 플러그인 실행 제한도 별도 개선 과제이며, Fusion 매니페스트의 `SupportedInMultiActions` 선언만으로 D200X의 다중 동작 지원이 완료되지는 않는다.
- **기록 규칙:** 실제 구현 전 `미착수`, 기능 코드 반영 후 `코드 구현·실기 미검증`, 사용자 실기 증거 확보 후에만 해당 범위 `실기 확인`으로 변경한다.

## 카탈로그 외 명시적 미완성 / 추가 후보

| 기능 | 현재 상태 | 구분 |
|---|---|---|
| Windows 마이크 음소거 | **미구현** | 오른쪽 18개 D200X 추가 액션과 별도 후속 후보. 기존 액션에 있다고 쓰지 말 것 |
| Windows 기본 출력 장치 전환 | **미구현** | Soundboard 재생 대상 출력 선택과 다름 |
| Node.js Stream Deck 플러그인 실행 | **원본 Fusion Node 플러그인 자동 SDK 검증 통과·실제 Fusion 실기 미검증** | `sd-plugin-host.cjs`에서 Node 20+ 및 manifest 선언 버전 검증, Electron 내장 Node 실행, SDK WebSocket, key event, 폴더 설치 코드. Fusion의 Node 24는 Windows 패키지 Node 24.22.1 실행 및 SDK 통합 테스트 12개 성공; 실제 Fusion 실기 미검증. 무제한 플러그인 호환 의미 아님 |
| 네이티브 Stream Deck 플러그인 실행 | **미구현** | 별도 프로세스/SDK 호환 체계 필요 |
| 온라인 플러그인 마켓플레이스 | **미구현** | 플러그인 탭과 로컬 설치는 이미 구현·사용 중. 웹 기반 플러그인 검색·다운로드 마켓만 별도 미구현 |
| 원본 전체 아이콘 편집기/앱별 프리셋 검색 | **미완성** | 간이 아이콘 제작·고정 단축키 프리셋은 존재 |
| 프로필 저장 원자성·파일 버전 관리 | **미구현** | 무손실 이관·백업 전략 선행 |

## 2026-11-15 코드 경로 재검증 — 정적 UI만으로 판정하지 않음

**대상 코드:** `c738f16095996d64b2dd8b215515743fba299390` (이후 문서 커밋만 적용). `index.html`, `editor.js`, `action-panel-icons.js`, `deck-core.js`, `preload.cjs`, `main.cjs`, `sd-plugin-host.cjs` 및 관련 테스트 3종을 GitHub에서 읽어 비교했다. **이 확인은 소스 수준 감사이며 EXE 실행이나 물리 D200X 전체 실기 검증은 아니다.**

| 대상 | 증거 코드 연결 | 판정 |
|---|---|---|
| 플러그인 탭 | `index.html` 초기 disabled → `editor.js:2691` 해제 → 탭 클릭 시 `libraryTab='plugins'` 및 `renderLibrary()` → `renderInstalledSdkPlugins()` | **구현 및 사용자 실사용 확인**. 이전 '미구현' 판정 철회 |
| 플러그인 추가 | `editor.js:458` 설치 요청 → `preload.cjs` `sdkInstall` → `main.cjs:23` 파일 선택/설치 → `sd-plugin-host.cjs` `parseArchive/install` | **구현**. 실제 설치 가능한 것은 검증에 통과한 HTML 기반 `.sdPlugin`; Node.js 지원을 뜻하지 않음 |
| 플러그인 액션 등록·실행 | `renderInstalledSdkPlugins()`에서 드래그/클릭 → `newAction('sd::...')` → `scheduleSdkSync()` / `sdkActionInstances()` → IPC `sdk-sync`, `sdk-key` → SDK 호스트 | **코드 연결 + 사용자 플러그인 사용 보고**. 임의 플러그인 전체 호환은 보장하지 않음 |
| 플러그인 속성창·상태 | `actionFields('sd-plugin')`에서 원본 설정창 버튼 → `sdkInspector`; SDK 이벤트 `setTitle/setImage/setState/settings` 처리 | **코드 연결**. 각 플러그인별 실제 속성·이미지 갱신은 별도 실기 |
| Node.js/네이티브 호스트 | `sd-plugin-host.cjs:validateManifest`에서 `.html` 및 `.js/.cjs/.mjs` 허용, native `.exe` 거부. Node 프로세스와 SDK WebSocket 연결 코드 존재 | **Node.js 코드 구현·Windows/Fusion 실기 미검증, 네이티브 별도 미구현** |
| 설정 ⚙ | `index.html`의 설정 버튼 disabled 및 `editor.js`의 'main settings remains disabled' 주석, 활성화 경로 없음 | **상단 설정 화면 미구현**. 프로필·플러그인별 설정 기능은 별도로 존재 |
| Virtual Stream Deck | `renderLibrary()`에서 `virtual` 항목 draggable=false·disabled 표시, `isAssignableAction()`에서도 제외 | **사용자 지시로 개발 보류** (코드상 비활성은 유지) |
| 프로필 JSON 가져오기/내보내기 | `editor.js:2593` 이후 전체 JSON 다운로드·가져오기/검증·기존 상태 백업·복원 처리 | **코드 구현**, 원자적 디스크 저장과 다른 기능 |
| Smart Profile 기본 복귀 | `editor.js:2701` 4초 폴링의 `matched || fallback`, `main.cjs:705` 최소화·Windows 전경 앱 IPC 제한 | **코드 구현**, 실제 앱 전환·예외 조건은 실기 미확인. 과거 '기본 복귀 미구현'을 현행 상태로 인용 금지 |
| Multi/Random/Switch/Logic | `deck-core.js:planComposite/runComposite` 및 `editor.js:1725` 이후 하위 실행 엔진·`executeHardwareAction`의 복합 분기 | **부분 구현**. SDK 플러그인의 Multi 하위 실행은 `executeMultiStep`에서 명시적으로 거부 |
| 전체 카탈로그 | `action-panel-icons.js`의 43개 그룹 ID ↔ `deck-core.js` 24+18+2 모델 ID ↔ `editor.js` 속성 분기 ↔ 이 상태표 ID | **모든 43개 ID가 상태표에 존재함을 대조**. UI에서 보이는 항목은 42개(레거시 HA 제외), 그중 Virtual은 비활성 |
| 아이콘 라이브러리 하단 확대 표시 | `index.html`의 `span.icon-zoom`은 표시용 마크업. `editor.js`에 해당 요소의 이벤트 핸들러 없음 | **이 표시 자체는 조작 가능한 확대/축소 버튼으로 확인되지 않음**. 실제 목록 표시 방식 버튼 `icon-library-layout`과 구분 |

### 자동 검사와 실기의 범위

- `test/streamdeck-core.test.cjs`에서 액션 플래닝·프로필·와이드/노브, `test/streamdeck-sdk-host.test.cjs`에서 HTML 매니페스트·호스트, `test/streamdeck-transport.test.cjs`에서 전송·절전·재연결 등의 테스트 정의를 확인했다. **이번 감사에서 테스트를 새로 실행하지 않았다.**
- 기능 소스 `c738f160` 기준 GitHub Actions [CI #43683897871](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683897871), [입력 검증 #43683894235](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683894235), [Windows Preview #43683894213](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683894213)은 각각 `success`로 재조회됐다.
- **실물/Windows 미확인:** 모든 액션에 대한 앱별 효과, 여러 종류의 Stream Deck 플러그인 호환성, 최근 와이드 통계 화면 1회 입력, 물리 버튼·노브 삭제 UI 등.
- 이후 상태 변경은 HTML 초기 속성·주석만으로 결정하지 않고 반드시 **렌더러 실행 경로 → preload/IPC → 실행기 → 자동 검사/실기 보고**로 판단한다.

## 최종 사용자 실기 / 자동 검증을 혼동하지 말 것

- 사용자 실기 확인: **CPU/RAM/GPU 화면 겹침 제거**, 일반 와이드 정보 화면의 한 번 누름 순환.
- **아직 사용자 최신 EXE 재검증:** 통계 화면에서 여러 번 눌러야 넘어가던 문제, 와이드 액션 등록 차단, 물리 버튼·노브 우클릭 삭제 및 속성창 동작 일치.
- 최신 기능 코드: `c738f16095996d64b2dd8b215515743fba299390`.
- 코드 기준 자동 검사 기록: [CI #43683897871](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683897871), [물리 입력 모의 #43683894235](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683894235).
- 코드 기준 Windows EXE 패키징: [#43683894213](https://github.com/SoonCheol/D200X-Deck/actions/runs/43683894213), artifact `14149443199`, 성공/업로드 확인 당시 미만료.
- 본 문서만 변경한 커밋에는 EXE 빌드를 실행하지 않는다. `main` 및 PR 병합 금지.

## 문서 운영 규칙 — 향후 혼재 방지

1. **이 파일만 현재 기능 상태표로 유지한다.** 최신 소스가 기존 표의 판정을 바꾸면 해당 행의 상태·근거·검증 범위를 먼저 수정한다.
2. `docs/D200X-COMPLETE-HANDOFF-20261114.md`는 **시간순 작업 이력 및 세부 인수인계**, `docs/D200X-STREAMDECK-ROADMAP.md`는 **목표·설계·오래된 체크 이력**, `docs/D200X-BUILTIN-ACTIONS-EXPANSION.md`는 **확장 설계/기록**으로 읽는다. 해당 문서의 '최신' 표시는 작성 날짜에 한정한다.
3. 단순 코드 작성, 단위 테스트 성공, Windows EXE 패키징, 사용자 실기는 서로 다른 증거. **실기 미확인 항목에 '완료' 표시 금지**.
4. 수정 시: **관련 코드 → 이 표의 해당 상태/근거 → 상세 이력** 순서로 함께 갱신. 기존 개발 이력은 삭제하거나 과거 사실을 조용히 덮어쓰지 않는다.
5. 다른 문서에서 구식 상태표가 발견되면 이 파일로 연결하고, 그 문장을 현행 판정으로 인용하지 않는다.
6. 사용자 승인 없이 `main` 변경, PR 병합, 프로필/사용자 데이터 삭제, 신규 플러그인 구현 금지.

## 2026-11-16 — Fusion 실제 메뉴 전용 명령 일괄 등록 (코드 구현)

- [x] 디자인 작업 영역의 사용자 지정 9개 탭 메뉴 스냅샷에서 배치 959건·고유 ID 326개만 추출하여 `tools/fusion-mcp/fusion-menu-catalog.json` 기록.
- [x] MCP 명령 조회 및 `fusion_export_batch` 내보내기에 메뉴 ID 화이트리스트와 메뉴 순서 적용. 메뉴에 없는 API 전용 ID 배제.
- [x] 같은 표시명이라도 서로 다른 ID는 분리, 같은 ID가 여러 메뉴에 반복되어도 한 번만 등록. 기존 프로필 가져오기 방식 유지.
- [ ] 최신 자동 CI 실행 결과 확인 및 사용자 Windows/Fusion/D200X 실기 검증. 코드와 실제 작업 영역별 실행 가능 여부는 별도로 판정.
- 주의: 메뉴 구조는 Fusion 2706.1.17 수집 결과이며, 메뉴 배치가 곧 실행 가능을 뜻하지 않는다. 사용자 승인 없이 새 설치 빌드 또는 PR 병합 금지.
