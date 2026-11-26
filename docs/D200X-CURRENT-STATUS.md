# DeckForge 현재 작업 상태
> 2026-11-26 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.83**.
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.9 후보 및 기존 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 감사 19/13행 소스 대응표 작성, 잔여 GUI·실제 장애 별도.
- 04A Model 2: service/button partition·runner 재사용, lane 직렬화·lease 취소·idle LRU/30초·suspend/close·realm reset. legacy 복귀 DECKFORGE_SDK_RUNNER=legacy, 실패 이벤트 재실행 금지. 1.1.189 Windows 성공; 1.1.230 실제 장애 검증 통과.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
## 다음 작업
- 2.0.81: 검증 후 Windows 모달 설치/나중에 확인, 취소·닫기는 보류, 설치 승인 후 준비 상태 재검사 및 실행 성공 후 정상 종료, NSIS runAfterFinish=true로 대화형 설치 완료 후 자동 실행. 기존 데이터·파일 보존. 집중 모의 검사 및 문법 검사, Windows #85 성공, 설치 확인/재실행 실기 별도.
- 2.0.79: 업데이트만 수정. 진행률 0~99/검증 완료 100, 탐색기 자동 열기 제거, 미저장/실행 중/프로필 저장 오류 재확인, 검증 EXE 실행 요청 성공 후 정상 종료. 최신/직전 보존 및 재사용 유지. 문법 검사 및 Windows #83 성공, 자동 설치 실기 확인 대기. 2.0.78 Windows #82 성공, 설치본 생성 확인; 사용자 보고 동일 버전 중복 파일 및 탐색기 복수 창.
- 2.0.78: 다운로드 전용 폴더 최신/직전 보관 버전 각 1개, 동일 버전 SHA 재검증 재사용, 성공 후만 정리. 이전 파일 없으면 최신만, 높은 버전/다른 파일/폴더 보호. 문법·선별 검사 통과, Windows 파일 검증 대기.
- 2.0.77: 게시 EXE Downloads/DeckForge 다운로드, 크기/SHA-256·HTTPS 검증, 기존 파일 보존/탐색기 선택. 자동 실행·종료 없음, Actions fallback 유지. Windows #81/CI #1509/입력 #572/SDK #201 성공, 실기 별도.
- 속성 연결 감사 1~10: 밝기 설정/조절, 화면 끄기, 폴더, 프로필, 이전/다음/선택 페이지, 페이지 표시의 필드·기본값·실행 경로 대조 및 core 계획 25조건 통과. Virtual 등록 불가 유지. 실제 장치 미검증. 11~18: 프로그램 열기/종료, 파일/폴더, 웹, 일반/관리자 터미널, 통합 열기. 기존 순간형 Key Up/Down 및 실행 경로 유지. 웹 URL/HTTPS 공통 바인딩과 브라우저 직접 선택 시만 경로 활성화, 기존 경로 보존. 8개 설정/실행 계획 집중 검사 및 Windows #84 성공, 실기 대기. 19~29: 노출 멀티미디어 5종·키보드/마우스 6종. 스크롤 축/방향 공통 갱신, 상용구 2048자 제한/실시간 카운트(기존 초과 데이터 미절단), 순차 효과음 출력 장치 및 노브/순차 음량 표시/숫자 저장 보완. 기존 카드·실행·숨김 10종 유지. 집중 검사/문법 통과, Windows/실기 별도. 30~35: 순차/스위치/무작위/Key Logic/타이머/터치 검증. 복합·노브 타이머 사용자 알림음/음량, 지속 시간 범위 및 중첩 효과음 음량 표시 보완. 실행 엔진·입력 판정·카드 유지. 노출 기본 35종 소스 감사 완료, 집중 모의 검사·문법 통과; Windows/실기 별도. 다음 플러그인 속성창 점검.
- 2.0.76: HA 기타 기기 좌측 기존 OFF 편집/우측 inert·disabled, 이전 상태 데이터와 실행 유지. 반대 상태 자동 페어 쓰기 금지. Windows #80/CI #1506/SDK #198/입력 #571 성공, EXE 게시. 정렬 감사 #3(45786747243) 40/40, flags 없음.
- 2.0.72~74: 순차 동작 스위치 2카드, 기존 데이터/실행 보존. #76/#77 검사 조건 수정 후 Windows #78/CI #1499/SDK #191 성공.
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
