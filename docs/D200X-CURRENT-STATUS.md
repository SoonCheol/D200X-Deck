# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **1.1.213** (07B-3 범용 단일 전경 카드 후보).
- 감사 기준 소스 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공(커넥터 확인); Windows #930 성공(사용자 인수인계, 이번 문서 작업에서 재검증하지 않음).
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.8 후보 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 전체 19개 경로 및 44개 테스트 독립 검증은 미실시.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01~04A: 검증 인벤토리·instanceId/mountGeneration·공통 합성기·Model 2 실행 격리 구현 및 집중/Windows 검사 통과. 1.1.183 깜박임 국소 개선, 04B 별도. 상세 SDK 계약 및 Git 참조.
- 02~03: UUIDv4·세대 검증·렌더 합성/dirty loop·Fusion 중복 갱신 차단 구현. 사용자 1.1.182 편집기 깜박임 해소 확인, 물리 버튼 깜박임 없음. 개별 키 USB 기본 OFF, HA 제어 재실행 금지. 상세 이력은 Git/SDK 계약.
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
- 1.1.208: 07A settingsUI 별도 선언(그룹·조건·정수 슬라이더) 및 색상 값 타입, 기존 form 재사용. 숨겨진 필드는 기존 값 유지; 비HA 예제 및 집중 검사 추가. CI #1256·입력 #508·Windows #962 성공; GUI 별도.
- 1.1.209: 선택 titlePolicy, 현재 선택 label/명시 빈 제목/동적/기본 우선순위, 상태별 자동/직접 입력 분리. 기존 미선언 플러그인 유지. HA 전용 호환 및 센서 특례 제거는 후속. CI #1257·입력 #509 성공, Windows #963 실패(독립 VM에 nativeTitlePolicyFor 미포함).
- 1.1.210: VM에 실제 제목 정책 함수 포함, 복제 슬롯 및 빈 제목·상태별 동적/직접 입력 집중 검사 추가. 생산 제목 코드 미변경. CI #1258 성공, Windows #964 실패(추가 상태별 검사에서 동일 VM const 재선언).
- 1.1.211: 동일 VM에서 실제 함수 단일 평가 후 상태별 검증 반복. 생산 코드·검사 조건 유지. Windows #965·CI #1259 성공.
- 1.1.212: HA 0.1.7 titlePolicy 적용, 기존 자동 제목 marker 기반 비파괴 이관(읽기 복사/승인 편집 시 저장), 명시 빈 제목·독립 상태 제목 보존, 집중 검사 추가. 구 HA 호환 유지. CI #1260·입력 #510 성공, Windows #966 회귀 및 EXE 패키징 통과, 설치 게시 대기.
- 1.1.213: manifest visualPolicy:'foreground'(단일 Keypad) 공통 속성 카드·레이어, 비HA 예제/복제 슬롯 검사 추가. HA 0.1.8 선언 사용, 옛 HA ID 및 저장 이관 호환 유지. 내부 CSS/합성 필드명 보존. 자동 검사·GUI 대기.
## 다음 작업
- **07 범용 schema/제목:** 07B-3 자동 검사 후 07 범용 schema/제목/전경 검증 및 잔여 정책 확인, 08 관리 체계 및 기존 2상태/단일 카드 보존. HA 실제 서버 별도. Model 2 유지; 04B 저장소 격리·OOM·자원 한도 검증 전 Model 5 활성화 금지. 기존 실기 미리보기 정책 유지.
- 이후 02 식별자 → 03 이미지 → 04A/B 실행 엔진 → 05 저장 → 06 통신 → 07 범용 schema → 08 관리 → 09 USB → 10 출시 검증.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](D200X-STREAMDECK-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
