# DeckForge 현재 작업 상태
> 2026-11-26 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.75**.
- 감사 기준 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공; Windows #930 사용자 인수인계.
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.9 후보 및 기존 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 감사 19/13행 소스 대응표 작성, 잔여 GUI·실제 장애 별도. 현재 root 45개 suite 등록 및 실제 실행 로그 대조 완료.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 04A Model 2: service/button partition·runner 재사용, lane 직렬화·lease 취소·idle LRU/30초·suspend/close·realm reset. legacy 복귀 DECKFORGE_SDK_RUNNER=legacy, 실패 이벤트 재실행 금지. 1.1.189 Windows 성공; 1.1.230 실제 장애 검증 통과.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
## 다음 작업
- 2.0.75 유지: 기본 액션 35개 Electron 카드 좌표·크기·저장/취소·미리보기·필드 실측 감사 착수. 제품 및 설치본 변경 없이 검증 전용.
- 2.0.75: GitHub 등 단일 상태 foreground 플러그인의 Key Up/비활성 Key Down/미리보기 통일. SDK·저장·실행 변경 없음. 집중 검사 및 Windows #79/CI #1501/SDK #193/입력 #570 성공, EXE 게시.
- 2.0.72: 순차 동작 스위치 일반 LCD 상태 1/2 공통 카드 및 미리보기. 기존 stateVisuals·제목 연결·실행 순서·활성 상태 보존. Windows #76 57/58 실패, 2.0.73 기존 단축키 검사 수정. #77 157/158 실패(상태 카드 식별자 검사 미갱신), CI #1498/SDK #190 성공. 2.0.74 해당 검사 수정, Windows #78/CI #1499/SDK #191 성공.
- 사용자 승인 2.0.71: 화면 끄기/Key Logic 및 비활성 Virtual의 기존 표시 설정을 왼쪽 카드에 계승, 우측 비활성 카드와 미리보기. 실제 두 상태/특수 장치/SDK 동작 및 데이터 유지. 집중 검사 및 Windows #75/CI #1495/SDK #187/입력 #568 성공, 실기 확인 대기.
- 긴급 2.0.70: Fusion 단일 runcommand 제외 시 카테고리가 숨겨지는 회귀 수정. Fusion 관리자 일반/검색 표시 복구, 정확 선택 및 다른 플러그인 필터 유지. 기존 데이터/SDK 미변경. Windows #74/CI #1492/입력 #567 성공, 2.0.70 EXE 게시. Fusion 실기 표시 확인 필요.
- 2.0.67 Windows #71/CI #1483/SDK #175 성공. 사용자 실기: HA 페이지 진입 깜박임 사라짐(2026-11-26); USB 전송 횟수 미측정. 500ms 초기 게이트 유지.
- 2.0.65 GitHub 속성창 자동 선택 및 2.0.64 HA 스키마 이관은 Windows #73 통합 회귀 통과; 개별 실기 별도.
- 2.0.61~63 미리보기 편집기 전용 상태 및 관련 회귀 Windows #73 통과. 전체 속성창 공통화는 후속 보류.
- P1 2.0.68: HA 0.1.15, 지원 11개 도메인 서버 필터, invalid_format 시 새 ID 전체 구독 1회 폴백, 연결 세대/구독 ID 검사, 재연결 모의 소켓 실제 Electron 회귀 추가. 기존 토큰·설정 유지. Windows #72/CI #1485/SDK #177 성공, 실 HA 별도. 2.0.69 구현: HA 0.1.16, 명시적 socketJsonArray + socketBatch capability, 첫 ID 1 supported_features, 논리 메시지별 FIFO/바이트 회계와 구버전 폴백. Windows #73/CI #1487/SDK #179 성공. 실제 Electron 모의 HA 500개/13키/50개 배열 1266ms, 재연결/구버전 폴백 통과; Model2 5분 1365 press/102 전환/235 tick, OOM 복구 통과. 테스트 전용 HA 지속 수신 60초(30초×2), 반복 재연결 3회 및 129 논리 메시지 과부하 복구 검사 추가. 제품 버전 2.0.69 유지. CI #1489 성공, SDK #181(45725696551) 성공: 65.39초/728 메시지/52회/재연결 3회/과부하 복구, 모의 소켓 실제 Electron. 2.0.69 설치 EXE 게시 확인. 실제 HA/D200X/OS 실기 별도.
- 긴급 P0 2.0.53~56: HA rate-limit 실제 장애. Gemini SDK-WebSocket-Analysis 434행 검토/소스 대조 완료. 수신 FIFO·바이트/버스트 예산·선택 배치·재연결 안정화·scheduler 포화 복구 및 HA 0.1.13 구현, 실제 Model2 13키/500엔티티/50프레임 검사 추가. 2.0.53 CI #1456 성공, Windows #57 fixture 실패(false/undefined), HA 배치/재연결/입장 검사 통과. 2.0.54 stale 버퍼 회계·admission 구분, 2.0.55 mock fixture 정정, 2.0.56 가상 clock 정수화(부동소수점 경계 오차). Windows #58 126/128, #59 127/128(가상 clock 경계 fixture). 2.0.56 clock 실제 함수 3조건 통과, Windows #60(45686518816) 성공/게시, 128/128; CI #1459·SDK #151 성공, 실제 Electron 500엔티티/13키/50프레임 881ms 및 5분 soak/OOM 통과(모의 소켓). 실HA 별도. 기존 인증·프로필 보존, 실기 별도. SDK 1.0 출시 보류.
- 2026-11-26 사용자 승인: Model 2만 SDK 1.0 정식 출시 경로로 확정, Model 5 연구 보류/제품 OFF. Gemini report001/002 전문 검토. P0 2.0.43 후보: private ops JSON snapshot·null prototype envelope 방어 및 Object/Array prototype toJSON 거부, ctx.memory validateValue(8KiB/깊이/금지 키), 실제 Electron 집중 회귀 추가. CI #1428·SDK #120·Windows #47 성공, 실제 serialization 3종/메모리 5종 거부 통과. P1 HA 내장·최종 Windows 회귀, P2 실제 장치/HA/OS/GUI. P1 자동 검증 통과, P2 실기 남음. Model 5 시험 이력·코드 Git 보존.
- 실기 2.0.42: 절전/대기 복귀 후 HA 전등 상태·제어 및 GitHub 조회 정지, 일반 입력/CPU/RAM 정상(사용자 보고). 완전 종료·재실행 후 표시 정상. OS 이벤트/실행 로그 미확보, 원인 미확정. 2.0.44 후보: resume 단독 수신에도 이전 runner/socket/queue 취소 후 초기화, stale 입력 재실행 금지 유지, sdk-power-suspend/resume 진단 기록 및 WSS 재연결 집중 회귀 추가. CI #1430·입력 #552·Windows #48 게시·SDK #122 성공(1417 press/107 전환, 5분 및 보안 검사 통과). 실기 대기. SDK #124 실제 Electron resume 단독/이전 입력 13개 폐기·새 입력 13개 복구·서비스 재시작 통과(실제 OS 제외). 기존 Model 5 시험 이력 Git 보존.
- **10C 판정:** 자동 검증/설치본 통과, 정식 SDK 1.0 출시 보류. 실제 HA/D200X/OS 절전·재연결/실기 장시간 사용, identity GUI 별도; Model2 자동 soak/OOM 및 설정 저장 검사 통과, 1.1.234 Windows 통합 검사 통과, 전원 손실/제품 IPC 실기 별도. Model5 연구 보류, KEY 기본 OFF, 기존 미리보기 유지.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](DECKFORGE-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
