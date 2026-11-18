# DeckForge 1.1 · D200X 최신 통합 상태·활성 계약

> **상태 기록 기준: 2026-11-18**. 실제 최신 HEAD는 Git에서 확인하며, 코드·자동 검사·Windows 빌드·사용자 Windows/D200X 실기 결과를 구분한다. 시작 시 `AGENTS.md`와 이 문서만 읽고 로드맵은 필요한 경우에만 참고한다.

## 1. 최신 작업 인계 — DeckForge 1.1.1 (2026-11-18)

- **절전 복귀 후 HA 명령 불능:** 사용자 실기에서 페이지 이동·HA 상태 아이콘 갱신은 정상, 물리 버튼과 실행 테스트 실패, 앱 완전 종료 후 재실행으로 복구. 상태 REST 폴링(6초)과 SDK 명령 WS 분리. 직접 장애 위치는 미확정.
- **코드 반영:** main.cjs powerMonitor suspend/resume; sd-plugin-host.cjs 활성 HA만 복귀 2.5초 후 재시작, 기타 활성 SDK는 로컬 WS 단절시 선별 복구, 명령 재전송 금지, 중복 실행 방지 및 HTML 렌더러 보호. systemDidWakeUp/ping-pong/상류 상태 검사 미구현. 실기 재발 여부 확인 대기.
- **레이아웃:** 6c6edf4에서 상태 인스펙터에 따른 상단 grid 높이 변경 CSS 제거. 실기 확인 대기.
- **버전:** 1.1.1부터 package.json 기준 앱/업데이트 메뉴/다운로드 파일명 통일. 수정 배포마다 patch 증가. 제품명 DeckForge, 기기 Ulanzi D200X, 호환 규격 Stream Deck SDK.
- **검증:** 코드 기준 51965d4170e3332ba04100dc18afd43ffd84c456, [CI #937](https://github.com/SoonCheol/D200X-Deck/actions/runs/44265788222) success, [Windows #690](https://github.com/SoonCheol/D200X-Deck/actions/runs/44265788195) success. 실기 확인과 구별.
- **상세 인계:** [절전 복귀 장애·Google AI Studio 분석 요약·실제 패치·재발 진단](archive/D200X-HA-SLEEP-RECOVERY-20261118.md). 재발 문의 시 이 문서를 먼저 읽고 최신 소스와 비교한다. 이미 반영된 수정 반복 금지.

**브랜치:** `codex/streamdeck-761-clean-editor` · Draft PR #5 병합 금지. 사용자 지시 전 수정/빌드 금지.

## 2. 이전 확정 배포 상태 (2026-11-17, 1.1.1 이전)

| 구분 | 근거/상태 |
|---|---|
| 마지막 코드 검증 기준(2026-11-17) | `d360aa83d7851f69b6e0f3afdf74432570d82721` (최신 HEAD가 아님) |
| 최신 Windows 통합 빌드 | [Actions #44092348283](https://github.com/SoonCheol/D200X-Deck/actions/runs/44092348283) **success** |
| 설치형 | Artifact `DeckForge-1.1-Setup-win-x64`, ID `14331019961` |
| 포터블 | Artifact `DeckForge-1.1-win-x64`, ID `14331903227` |
| 이전 빌드 오류 | `jszip`을 워크플로 루트에서 찾지 못했던 실패를 `./app/node_modules/jszip` 경로로 수정, 이번 빌드 성공 |
| GitHub CI | 선행 변경 커밋 `ed3e291`에서 성공; `d360aa83` 커밋은 Windows 워크플로 성공과 별도로 CI 여부 확인 필요 |
| 실제 사용자 Windows GUI·D200X 전체 실기 | **신규 설치본 최종 확인 대기** |

- 사용자 제공 `app/streamdeck-editor/bundled/DeckForge_IoT_Icons.streamDeckIconPack` (106 아이콘, **DeckForge IoT Icons**, 제작자 **Airburst**)이 저장소에 있으며, Windows 워크플로가 이를 검사·포함한다. 내장 아이콘은 사용자 등록 팩과 별도로 `source='bundled'`로 표시되고 제거할 수 없게 한다. 기존 Fluent UI Filled/Regular 기본 팩 보존. Windows 실기 라이브러리 표시와 실제 사용은 확인 대기.
- 오른쪽 패널 탭은 **기본 액션**, `D200X 장치·화면` 그룹은 가장 위. 액션 ID·데이터 구조·다른 카테고리는 보존한다.
- 최근 상태별 아이콘 카드: 세 가지 회귀(잘못된 테스트 선택자, `T⌄` 재클릭 토글, 선택 시 `stateTitles` 자동 저장) 수정; `renderDeckKeyImage`로 개별 제목·글꼴·색상·정렬·윤곽선을 카드 이미지 위 합성. 비동기 미리보기 결과는 버전 체크로 구형 응답 폐기. 설정 편집 전 SDK 실시간 `setTitle`을 덮어쓰지 않음. 자동 검사와 실제 화면 결과는 구분.

## 구현 완료·부분 구현 요약 — 중복 개발 방지

| 분야 | 현재까지 확인한 수준 | 다음 단계의 실제 잔여 범위 |
|---|---|---|
| 독립 Stream Deck형 UI 및 액션 카탈로그 | **[코드·자동]** 24개 원본 ID, D200X 확장 액션, 드래그/인스펙터/액션 검색·테마, 승인 레이아웃. 오른쪽 탭 **기본 액션**, `D200X 장치·화면` 최상단 | 배율별 실제 화면·동적 속성·우클릭 조합을 원본과 대조 |
| 코어·USB 입력 및 전송 | **[코드·자동/부분 실기]** `deck-core.js`, `transport.cjs`, `device-sync.js`; 페이지/노브/측면 이벤트, 5초 유지통신·재연결 복원·밝기 보호, 버튼 PNG | USB 재연결·장시간·급회전·Key Down/Up 물리 실측과 장애 시나리오 |
| 프로필·폴더·페이지·고정 키 | **[코드·자동/부분]** 생성/전환/저장·JSON 복원, 폴더·Auto Exit·Smart Profile, 고정 키 상속 및 관련 회귀. **`profile-store.cjs`는 `Profiles/profiles.json` 원자적 기록 + `.bak` + 해시 아이콘 파일을 구현** | 일부 예외(고정 키 변경의 실시간 공유, 폴더 자동 종료 제외 액션 등), 최신 PC 실기/구형 설정 보존 확인. 이전 “파일 저장 미구현”은 오래된 기록 |
| 다중 동작 `multi/multi-switch/random/logic` | **[코드·부분]** 하위 모델·편집·실행·상태 복원·입력 분기가 단계별로 구현되고 자동 검사 기록 존재 | 원본 7.6.1의 세부 UI·딜레이·중단/재입력·중첩 제한 비교, 실제 HID double/hold·저장/재시작 검증 |
| 기본 시스템/미디어 액션과 D200X 확장 | **[코드·부분]** Windows 시스템·파일/앱·미디어·타이머·입력·브러시/타임라인 기능 다수 연결, 버튼/노브 공통 설정 경로 존재 | 실제 Windows 효력, 사용자 앱별 단축키/포커스·출력 장치·오디오·장시간 동작의 미지원/부분 항목 판정 |
| 제목·아이콘·상태별 이미지 | **[코드·자동]** Pretendard+심볼 글꼴, 프리셋, Key Up/Down 및 OFF/ON, **상태별 독립 제목**과 동일 PNG 합성기 미리보기·비동기 경합 보호 | 최신 승인 카드 레이아웃/제목 조합을 실제 Windows·D200X에서 확인 |
| 아이콘팩/외부 자산 | **[코드·자동]** Fluent UI Filled/Regular 내장, ZIP/폴더 가져오기·삭제/기본 팩 보호, **DeckForge IoT Icons 106개 내장 파일**. 외부 팩은 사용자 데이터와 분리 | 설치 직후 IoT 팩 표시·선택·프로필 저장 및 대형 파일/애니메이션 제약 확인. 이전 “대체 샘플만 존재”는 폐기 |
| Home Assistant·Stream Deck SDK·Fusion | **[코드·자동/사용자 부분 실기]** HTML/Node 호스트, 원본 PI·설정·이미지, HA, Fusion 원본 SDK 및 메뉴 명령/Manager·캐시 경로 | 버전/플러그인별 실제 연결·상태 이미지·Fusion 명령 실행·데이터 보존. **플러그인 개발 ‘미착수’라는 구형 계획은 폐기** |
| Windows 배포 | **[자동]** DeckForge 1.1 설치형+포터블 성공: [#44092348283](https://github.com/SoonCheol/D200X-Deck/actions/runs/44092348283), 두 Artifact 확인 | Windows 설치 후 실제 실행·업데이트/제거 선택·설정 보호·USB/PI 테스트. 이후 **문서 전용 커밋에는 새 빌드 불필요** |

**주의:** [코드·자동]은 Windows GUI/D200X 전체 실기 검증을 의미하지 않는다.

## 3. 사용자 승인 UI: 기본 골격·상태별 카드 (최신 예외 우선)

**기본 UI 고정**: 왼쪽 D200X 일반 키 13개·와이드 1개, 측면 버튼 2개, 노브 3개와 페이지 제어; 아래 인스펙터; 오른쪽 프로필·장치·설정·검색·기본 액션/플러그인 영역. 외부 앱 인스펙터/UI로 대체하거나 임의 재배치·폰트/버튼 높이 재설계 금지. 변경은 사용자 요청된 국소 범위만.

**기존 일반 키 인스펙터의 4영역 기본 원칙**(상태 카드가 없는 액션 등에 적용):
1. `.action-head`: 액션 경로·이름·도움말, 오른쪽 **▶ 실행 테스트**.
2. `.properties`: 대표 미리보기, 제목 및 전체 액션별 설정(복합 액션 포함). 동적 속성 완성 후 아이콘 영역 생성.
3. 아이콘 한 쌍: 일반/Fusion `Key Up → Key Down`, 실제 상태형 SDK `OFF → ON` 중 한 종류만; 저장한 반대 스키마의 값은 삭제 금지.
4. `.inspector-save-bar`: 기본은 하단 **취소 / 저장**. 대표 아이콘·제목·필드 값을 같은 시작선에 맞추고 숨겨진 필드 삭제·잘라내기 금지.

**2026-11-17 최종 승인 예외 — 상태별 독립 제목 카드가 실제 표시되는 일반 키**: 위 고정 196px 카드/4영역 규칙보다 **아래 사항 우선**.
- `.state-title-layout`은 **98px 대표 미리보기 + OFF/ON 또는 Key Up/Down 가변 카드 2장**을 한 가로줄에 배치, 간격 **12px**, 이미지는 정사각형 `aspect-ratio:1/1`, 공간에 맞게 자동 축소하되 비율 왜곡 금지. 창 크기에 따른 양방향 스크롤/클리핑 여부는 GUI 실측 대기.
- 각 카드 **상태명 바로 아래**에 제목 체크박스·입력 placeholder `제목`·`T⌄` 글꼴 속성 버튼. 별도 ‘제목’ 라벨 없음.
- 제목 1/2는 각각 텍스트·활성화·글꼴·크기·색·외곽선·정렬 독립. **둘 다 켜면 각각 해당 상태**, **하나만 켜면 두 상태가 그 제목과 스타일 공유**, **둘 다 끄면 출력 없음**. 해제해도 기존 내용/스타일 유지. 설정 없는 과거 항목은 기존 제목 fallback. `settings.stateTitles.first/second`는 사용자가 실제 편집할 때만 생성하며 선택/렌더만으로 저장값·dirty 상태를 만들지 않는다.
- 스타일 프리셋은 양쪽 모두 기존 단일 전역 `deckforge-title-style-presets-v1` 공유. 같은 `T⌄` 재클릭 닫기, 다른 카드/바깥 클릭 시 `aria-expanded=false`. 각 상태 카드의 이미지 미리보기 역시 실제 D200X 합성기와 같은 제목·스타일 사용.
- 각 카드의 기존 **라이브러리/파일/클립보드/특수문자/초기화** 버튼 **76×25px**, 간격 **4px** 고정; Pretendard 기본 크기 보존.
- 상단 **▶ 실행 테스트** 위치 유지. **플러그인 속성 열기**는 상태 카드 위 왼쪽, **취소/저장**은 같은 툴바 오른쪽. **이 경우 하단 저장 바 위치 규칙 적용하지 않음.**
- 이전 고정 계약은 카드 한 쌍 196px×2+12px=404px, 이미지 84px, 값 시작선 196px 및 `--inspector-preview-width:98px`를 정의했지만 **최신 가변 상태 카드 예외에 우선하지 않는다**. 예외 외 일반 액션/노브/측면 버튼/와이드는 기존 구조 유지.
- 공통 체크박스 15×15px 및 값 열 정렬, 폴더 자동 종료 시간의 별도 필드/숫자 내부 ‘초’, 웹사이트 프로토콜(기본 `http://`, 체크 시 `https://`), 프로그램 실행 인수 독립 전달, Windows EXE/LNK/BAT/CMD 드롭 시 응용 프로그램 등록·아이콘/제목 자동 추출은 기존 동작 보존.

## 4. Key Up/Down·상태형 아이콘의 예외 정책

- **일반 순간형과 모든 Autodesk Fusion 명령**: `Key Up` 기본, 물리 `Key Down` 누름 이미지. 놓으면 복귀. 이미지가 같으면 기존 축소 효과만 적용하며 이중 효과 금지. 속성창 미리보기 마우스 클릭은 **시각 시뮬레이션 전용**; HA 토글·명령·SDK `keyDown` 전송 금지.
- **실제 상태형**(HA ON/OFF, SDK `setState/setImage`, `multi-switch`): 상태 우선, Key Up에 OFF/기본 강제 복귀 금지. Fusion 전체 명령은 사용자 지정 무상태 예외. 일반 SDK 전체를 무조건 상태형 취급하지 않는다.
- **표시 전용** `indicator`, **와이드 특수 화면**은 일반 키 두 상태 이미지 정책 제외. `timer`는 카운트다운/문구, `logic`은 실제 Down/Up 판정, `open-app`의 hold(close/force)는 누름 시간을 보존. `hotkey-switch`의 내부 교대 상태 표시 정책은 후속 설계.
- **페이지·프로필·폴더 변경**(`previous/next/goto/profile/folder`)은 전환 뒤 새 화면 슬롯의 정상 이미지가 우선, 이전 눌림 상태 잔류 금지. `sleep`은 잠자기/깨우기 동작 우선.
- `multi`/`random` 등 일반 액션은 순간형 가능. `system-mute`나 `media`가 토글 명령이라는 이유만으로 실제 장치 상태를 추적한다고 가정하지 않는다. 노브 회전에 키 Up/Down 이미지를 임의 적용하지 않는다.
- **정책과 구현/실기 증거를 구분**. 예외 문서의 과거 “구현 전” 체크박스는 당시 스냅샷이다. 최근 Key Up/Down 카드 기능 코드·Windows 빌드 성공 기록은 본 문서에서 판단하되 물리 동작은 별도 확인한다.

## 5. 설정·자료 보존·플러그인 경로

- 현재 Windows Electron 사용자 데이터 루트는 **`%APPDATA%\DeckForge`**. 프로필은 `Profiles/profiles.json`, 직전 백업 `profiles.json.bak`; 이미지 데이터 URL은 `Resources/Icons/`에 SHA-256 중복 제거 파일로 분리 저장한다. 기존 localStorage 구성은 **사용자 승인에 따라 자동 이관하지 않으며** 삭제도 하지 않는다. 프로필 읽기 오류 시 빈 파일로 덮지 못하도록 저장 차단·사용자 알림 유지.
- 외부 아이콘팩 공통 라이브러리 `Resources/IconPacks/icon-packs-v1.json`, SDK 플러그인 공통 `Plugins/`. 구 `StreamDeck/IconPacks`·`StreamDeck/Plugins` 및 암호화 설정은 최초 안전 복사 후 **원본 보존**, 덮어쓰기/재등장 방지 로직 보호. 내장 팩은 앱 배포 리소스이며 사용자 JSON과 분리.
- 아이콘팩 가져오기 `.streamDeckIconPack`/ZIP/일반 이미지 폴더/`.sdIconPack` 폴더, 기존 원본 바이트 보존; 정적 144px 초과는 비율 축소, SVG는 안전 검사 후 PNG 변환. 대형 애니메이션 GIF/WebP를 임의 정지 이미지로 대체 금지. 압축 및 개별 이미지 용량·개수 검사 유지.
- Fusion 명령 캐시는 사용자가 지정한 이미지 우선, 정상 수신 이미지 우선, 연결 끊김 오버레이는 런타임 합성으로 **원본 이미지 불변**. 명령 식별은 단순 actionUUID 공통값이 아닌 `settings.pluginSettings.commandId` 기반, PC별 원본 Fusion 이미지/개인 데이터는 공개 GitHub에 올리지 않는다. Fusion add-in 건강 확인은 루프백 기반 `endpoint.json` + `/health`, WebSocket 연결과 실제 Fusion 실행 상태를 혼동하지 않는다.
- 파일/앱 드롭, HA 인증·기기 상태, Stream Deck HTML/Node SDK 플러그인·원본 Property Inspector·Fusion SDK의 기존 호환 경로는 보존. Node.js 호스트의 WebSocket 자동 프로토콜 검증 성공은 Fusion 실제 명령 실행/Windows UI/물리 키 성공이 아니다.
- 설치형(NSIS) 제거 시 **기본은 사용자 데이터 보존**, 명시적인 선택을 했을 때만 `%APPDATA%\DeckForge` 정리; 비대화형 제거는 보존. 다른 앱이나 구 폴더를 건드리지 않는다.
- 기본 UI 글꼴 **PretendardVariable.woff2** 13px, 보조 **NotoSansSymbols / NotoSansSymbols2**, 라이선스 동봉. 패키징 시 공식 바이너리 SHA 검증. 키 제목 `titleStyle.family='default'`은 내장 Pretendard, 사용자가 명시한 다른 글꼴은 보존. 네이티브 펌웨어 시계·정보 화면은 이 PNG 글꼴 변경 대상 아님.

## 6. 주요 기능·우선순위 및 보류

- Stream Deck 기본 **24개 액션 보존**, D200X 추가 18개와 HA 레거시/SDK 플러그인 경로 구별. 오른쪽 패널은 액션 그룹 + 별도 **작동하는 플러그인 탭**; 초기 HTML의 disabled만으로 미구현으로 판단 금지. `Virtual Stream Deck`은 **사용자 지시에 따른 개발 보류**.
- 기본 액션: Multi, Multi Action Switch, Random, Key Logic, 시스템/미디어/탐색/프로필/폴더. 일부 하위 조합·실제 앱/물리 입력 검증은 미완료. 물리 double/hold 시간 범위는 실기 근거 없이는 확정하지 않는다.
- 기본 액션 확장 24개 **후보**(기존 엔진 재사용 포함); 우선 8개: Windows 음량/음소거, 확대·축소, 스크롤, 실행 취소·다시 실행, 창 전환, 가상 데스크톱, D200X 밝기. 조절형 버튼·노브는 동일 `action.type/settings` 모델, 노브 단계 1/2/5/10 및 반전. 코드/모의 검증과 실제 Windows·D200X 반응은 구분한다.
- 폴더 최대 8단계, 신규 페이지 10개 제한(기존 10개 초과 데이터 삭제 금지), 고정 키는 다른 페이지 **빈 슬롯만** 상속·프로필별 격리. Auto Folder Exit은 **폴더 안에서 액션 실행 후** 0~60초, 0초 즉시 복귀. Smart Profile은 **기본 비활성, 편집기 최소화 중에만** 동작. 고정 상속 실시간 변경 공유·액션별 폴더 나가기 예외·전경 앱 실측 보완은 남아 있다.
- 물리 버튼/노브 페이지 이동 1회 뒤 무반응은 과거에 이미 디바운스/설정/상태 초기화 코드 보정함. **미착수 문제로 되돌리지 말 것**; 최신 설치본에서 재현될 때만 로그와 함께 국소 수정.
- 와이드 화면은 네이티브 시계/날짜·통계·노브 정보 모드 및 순환, CPU/RAM/GPU 겹침 등 사용자 보고와 후속 수정 기록이 있다. 모든 상태/버튼 1회 입력이 완전 해결됐다고 일반화 금지. 와이드 정보 슬롯에 일반 액션 드롭 금지, 노브/측면 버튼 우클릭 삭제 기능 유지.
- Fusion Command Manager는 Fusion 360의 실제 **메뉴 계층** 기준(스케치 → 솔리드 → 곡면 → 메쉬 → 판금 → 플라스틱 → 관리 → 유틸리티 → 자동화), 좌→우/위→아래 순서, 툴바가 아닌 메뉴 기준. 명령 아이콘 경합 및 드래그 동작의 국소 수정 기록이 있다. 실행 명령 성공 여부는 실제 Fusion 설치/애드인/버튼에서 별도 검증.
- 우선순위는 `docs/D200X-STREAMDECK-ROADMAP.md`의 계획과 최신 사용자 요청을 함께 따르되, 오래된 로드맵 체크박스가 최신 구현을 되돌리지 않는다.

## 7. Windows 설치본 검증 대기 목록

1. 속성창의 가로·세로 스크롤, 98px 대표 이미지 + 2개의 가변 정사각형 카드 한 줄 정렬, 창 최소 너비 클리핑.
2. OFF/ON 또는 Key Up/Down 별도 제목·스타일·체크 조합·이미지 실제 합성 및 기존 제목 fallback.
3. `T⌄` 팝오버 재클릭/바깥 클릭·프리셋 공유, 저장/취소, 플러그인 속성 열기/실행 테스트 위치.
4. SDK 실시간 제목 및 HA 실제 상태, Fusion 캐시·명령, 기본 액션/폴더/고정 키/노브/측면/와이드 입력 회귀.
5. **DeckForge IoT Icons** 106개 기본 라이브러리 노출, 기존 Fluent UI/사용자 아이콘팩 동시 유지.
6. 기본 액션 탭 이름 및 `D200X 장치·화면` 상단 순서, Windows 설치/제거 시 사용자 데이터 보존 동작.

## 8. 참고·인계 정책

- 기본 필독은 `AGENTS.md`와 이 문서 2개. `docs/D200X-STREAMDECK-ROADMAP.md`는 다음 개발 우선순위나 신규 기능 착수에만 읽는다.
- `docs/archive/`의 과거 인수인계와 `docs/PROTOCOL.md`, `docs/PLUGINS.md`, `docs/RELEASE.md`, `research/`, `docs/reviews/`는 필요한 부분만 조회한다.
- 상태나 구현/검증 결과가 달라질 때만 최상단 인계와 확인 근거를 고친다. 현재 HEAD 자체는 Git에서 확인하며 문서 전용 커밋마다 SHA를 연쇄 갱신하지 않는다.
