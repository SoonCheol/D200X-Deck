# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **1.1.208** (07A 범용 선언형 속성 후보).
- 감사 기준 소스 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공(커넥터 확인); Windows #930 성공(사용자 인수인계, 이번 문서 작업에서 재검증하지 않음).
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.6 후보 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 전체 19개 경로 및 44개 테스트 독립 검증은 미실시.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01 검증 기준선: 기존 44개/워크플로 8개 대조, 누락 4개 확인. 2개 오래된 검사 경계 수정 및 Windows 통합 검사에 남은 8개 등록, 신규 인벤토리 검사 포함 총 45개. CI #1225 성공, Windows #932 검사(추가 등록·Fusion 포함) 및 EXE 패키징 성공, 설치 프로그램 생성 진행 중 확인. 01 소프트웨어 기준선 통과. 런타임 소스 변경 없음; 1.1.178은 기존 자동 릴리스 태그 충돌 방지용.
- 02A: sd-plugin UUIDv4, 정규화·중복 방지, 복제·복사·가져오기·템플릿·백업·AI 처리 및 집중 검사 추가. 고정 등록은 현행 로컬 override를 보존하는 복사이므로 신규 pinned ID. 1.1.179 CI #1226·입력 #486·Windows #933 성공. 02B: 세션별 mountGeneration, 커밋된 설정 기반 등록, UUID 설정 저장 방어, IPC 등록 검증·즉시 이전 mount 폐기 및 테스트 추가. 1.1.180 CI #1227·입력 #487·Windows #934 성공(릴리스 게시 포함). 03A: 버튼 DOM 유지, 디코딩 후 원자적 교체, revision/owner 검증, 공통 합성기 visual descriptor·제한 LRU/in-flight 중복 제거, 폰트 세대와 렌더 시점 캡처. 미구성 SDK mount 제외 보완. 1.1.181 Windows #935 시작 화면 모의 테스트의 prepareDeckKeyImage 미주입 실패 확인/수정. 03B: single-flight, page epoch 및 슬롯 dirty revision, 실패 후 제한 재시도, wide 동일 스케줄러, stale decode/실패 재시도 보완. 1.1.182 CI #1229·입력 #489·Windows #936 소프트웨어/설치본 생성 통과, 릴리스 게시 진행 확인. 사용자 관찰: Fusion 명령 버튼 포함 페이지에서만 Windows 편집기 전체 버튼 주기 깜박임. 물리 D200X 버튼은 이전부터 현재까지 깜박임 없음. 소스상 3초 health 조회 및 호환 플러그인 중복 시각 이벤트 전체 렌더 확인. 1.1.183: Fusion 동일 title/image/state 무시, health 전환·캐시 및 연결 갱신을 Fusion 슬롯으로 제한, 집중 검사 추가. 1.1.183 CI #1230·입력 #490·Windows #937 성공. 사용자 확인: 1.1.182에서 편집기 깜박임 사라짐. 재발 시만 최후순위 재검토. 이미 반영한 합성기/국소 갱신은 유지하고 SDK 핵심 개발을 우선. 04A 후보 개발 중. Model 5는 보안/프로세스 격리 검증 조건부 목표, 개별 키 USB 기본 OFF, HA 제어 자동 재실행 금지.
- 1.1.184~187: 카드 팔레트·대표 번호·체크서클·여백·탭 클릭 규격 반영, 이전 정적 검사 수정 및 Windows 성공.
- 04A Model 2 후보: 플러그인별 service/button 분리 partition·renderer 재사용, lane 직렬화, 실행 lease 취소, idle LRU/30초 만료, suspend/close 정리. 기존 context FIFO·검증·realm reset 유지. legacy 복귀는 DECKFORGE_SDK_RUNNER=legacy (실패 이벤트 자동 재실행 금지). 집중 Node/실제 Electron PID·timeout/realm/서비스 생존 검사 추가. 1.1.188 실제 Electron PID 3844/3472 분리, timeout·서비스 생존 및 Node 검사 통과, 설치본 생성 성공, Releases HTTP 403 게시 실패. 1.1.189 Windows 전체 성공; CSP 결과 로그 미출력.
- 04B 선행 검증: 전용 Electron CSP/격리 검사만, 실제 앱 Worker 미등록.
- 1.1.190: Model 5 DrawOps 신뢰 painter 후보, 생산 경로 미변경. 후속 1.1.193에서 픽셀/host 검증 통과.
- 1.1.191~193: 카드 외곽 팝업 위치 규격, Windows 성공.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- 1.1.194: body 팔레트 미저장 이동 경고 오류 수정, Windows 성공.
- 1.1.195: 물리 버튼 단위 초안, 외부 이동 보호, Windows 성공.
- 1.1.196: 05A configRevision·요청 ID/만료/ABA 및 stale sync 보호. 후속 05B/C로 확장.
- 1.1.197: HA 0.1.4 투명 control/sensor 이미지, 동일 서버 업데이트 필요. Windows/CI 성공.
- 1.1.198~199: HA 센서 단일 편집·순서·실시간 레이어, 1.1.199 Windows/CI/입력 성공.
- 1.1.200: 05B 프로필 atomic 설정+receipt, ACK 영구 증거, 24h/4096건. Windows/CI/입력 성공. 1.1.201 Windows/CI/입력 성공(실기 실패와 구분).
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
- 1.1.202: 05C-1 읽기 전용 재조회, 미확정 저장 차단, 디스크/IPC 모의 장애. Windows/CI/입력 성공.
- 1.1.203: 선택 settingsResult·child exit 검사, Windows/CI 성공.
- 1.1.204: 05C-3 최신 mount 의도·ABA/slot/gesture·이동/복제·복합 효과 검사. Windows/CI/입력 성공. 감사 원문 13개 전체 대조/실제 전원 손실 미검증.
- 1.1.205: 06A WSS 연결 세대/갭·종료 예약 큐, old data 무효화. 포화 검사 추가, 빌드 대기.
- 1.1.206: 06B HA 0.1.5 catalogue/live 분리·generation/초기 snapshot·삭제·ACK 검사. 빌드 대기.
- 1.1.207: 06C API2 tickWhen 선택 조건(선택/boolean 비교 및 복수선택 최소 수), 기존 주기 계약 호환. HA 0.1.6은 auto+2개 이상만 tick, sharedState 회전 시각 유지 검사. 0.1.4 기존 설치 유지 가능, 새 HA는 동일 서버 수동 업데이트 필요. CI #1255·입력 #507·Windows #961 및 Releases 성공; Windows 로그의 06A~C 집중 검사 101~104 통과, 실기 대기.
- 1.1.208: 07A settingsUI 별도 선언(그룹·조건·정수 슬라이더) 및 색상 값 타입, 기존 form 재사용. 숨겨진 필드는 기존 값 유지; 비HA 예제 및 집중 검사 추가. 자동 빌드/GUI 대기.
## 다음 작업
- **07 범용 schema/제목:** 07A 자동 검사 후 제목 우선순위·HA 예외 제거 및 기존 2상태/단일 카드 보존. HA 실제 서버 별도. Model 2 유지; 04B 저장소 격리·OOM·자원 한도 검증 전 Model 5 활성화 금지. 기존 실기 미리보기 정책 유지.
- 이후 02 식별자 → 03 이미지 → 04A/B 실행 엔진 → 05 저장 → 06 통신 → 07 범용 schema → 08 관리 → 09 USB → 10 출시 검증.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](D200X-STREAMDECK-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
