# DeckForge 현재 작업 상태
> 2026-11-26 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.56**.
- 감사 기준 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공; Windows #930 사용자 인수인계.
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.9 후보 및 기존 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 감사 19/13행 소스 대응표 작성, 잔여 GUI·실제 장애 별도. 현재 root 45개 suite 등록 및 실제 실행 로그 대조 완료.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 04A Model 2: service/button partition·runner 재사용, lane 직렬화·lease 취소·idle LRU/30초·suspend/close·realm reset. legacy 복귀 DECKFORGE_SDK_RUNNER=legacy, 실패 이벤트 재실행 금지. 1.1.189 Windows 성공; 1.1.230 실제 장애 검증 통과.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
- 사용자 실기 보고: 테스트 플러그인 v1.0.0 제거 성공 2026-11-24 16:38:12 UTC, 보존 데이터 삭제 성공(2/2) 16:38:16 UTC; AI 로그 조회 확인. 원본 로그 직접 열람은 아님.
## 다음 작업
- P1 2.0.57: HA 지원 도메인 서버 구독 필터, 구버전 invalid_format 시 전체 구독 1회 폴백, 연결 세대별 구독 ID 검증 및 실제 Electron 재연결 검사. 서버 coalesce 협상은 배열/크기/권한 효과 처리 계약 검증 후 별도.
- 긴급 P0 2.0.53~56: HA rate-limit 실제 장애. Gemini SDK-WebSocket-Analysis 434행 검토/소스 대조 완료. 수신 FIFO·바이트/버스트 예산·선택 배치·재연결 안정화·scheduler 포화 복구 및 HA 0.1.13 구현, 실제 Model2 13키/500엔티티/50프레임 검사 추가. 2.0.53 CI #1456 성공, Windows #57 fixture 실패(false/undefined), HA 배치/재연결/입장 검사 통과. 2.0.54 stale 버퍼 회계·admission 구분, 2.0.55 mock fixture 정정, 2.0.56 가상 clock 정수화(부동소수점 경계 오차). Windows #58 126/128, #59 127/128(가상 clock 경계 fixture). 2.0.56 clock 실제 함수 3조건 통과, Windows #60(45686518816) 성공/게시, 128/128; CI #1459·SDK #151 성공, 실제 Electron 500엔티티/13키/50프레임 881ms 및 5분 soak/OOM 통과(모의 소켓). 실HA 별도. 기존 인증·프로필 보존, 실기 별도. SDK 1.0 출시 보류.
- 2.0.52: HA 기준 스위치 독립 전환, 연동 대상 1개·ON/OFF/반대로 작동 한 줄, HA 속성창 중앙 통일. 기존 연동 데이터 보존·새 대상 재선택 안내, HA 0.1.12. 2.0.51 단순 모의 검사에서 누락된 SDK 1효과 제한 보완: 기준 HA 성공 응답 후 연동 1회. 센서 옵션 3행·선택 해제 제거. Windows/실기 별도.
- 긴급 2.0.50: 2.0.49 최초/재실행 편집기 공백·실기 입력 무반응·AI 조회 불가 사용자 보고. 실제 초기 코드 재현: `액션 목록 누락: ha-other`. SDK 전용 아이콘을 실행 카탈로그에서 분리, 초기화 수정, Windows #54 성공/게시, 실제 Electron 14키·35액션·검색·입력/AI 함수 통과. 사용자 편집기 화면 복구 확인. 사용자 데이터 변경 금지.
- 2026-11-26 사용자 승인: Model 2만 SDK 1.0 정식 출시 경로로 확정, Model 5 연구 보류/제품 OFF. Gemini report001/002 전문 검토. P0 2.0.43 후보: private ops JSON snapshot·null prototype envelope 방어 및 Object/Array prototype toJSON 거부, ctx.memory validateValue(8KiB/깊이/금지 키), 실제 Electron 집중 회귀 추가. CI #1428·SDK #120·Windows #47 성공, 실제 serialization 3종/메모리 5종 거부 통과. P1 HA 내장·최종 Windows 회귀, P2 실제 장치/HA/OS/GUI. 개발 항목 9/10(90%, 동일 가중·실기 별도), 정확한 공수 아님. Model 5 시험 이력·코드 Git 보존.
- 실기 2.0.42: 절전/대기 복귀 후 HA 전등 상태·제어 및 GitHub 조회 정지, 일반 입력/CPU/RAM 정상(사용자 보고). 완전 종료·재실행 후 표시 정상. OS 이벤트/실행 로그 미확보, 원인 미확정. 2.0.44 후보: resume 단독 수신에도 이전 runner/socket/queue 취소 후 초기화, stale 입력 재실행 금지 유지, sdk-power-suspend/resume 진단 기록 및 WSS 재연결 집중 회귀 추가. CI #1430·입력 #552·Windows #48 게시·SDK #122 성공(1417 press/107 전환, 5분 및 보안 검사 통과). 실기 대기. SDK #124 실제 Electron resume 단독/이전 입력 13개 폐기·새 입력 13개 복구·서비스 재시작 통과(실제 OS 제외). 기존 Model 5 시험 이력 Git 보존.
- 2.0.40~42 안정성 보강 이력 Git 보존.
- SDK #93 실제 OOM 통과(reason=oom), 서비스/peer 생존, 입력 복구 및 5분 soak(1391 press/105 전환/274 tick), 임시 ProfileStore 장애 검사 통과. CI #1401 성공. 실제 장치/OS 절전 및 전원 손실 별도.
- 2.0.45 후보: HA 0.1.9 기본 액션 맨 위, 미설정 최초 설치/기존 서버 자동 보존 업데이트, 도움말 서버·인증·서비스·내보내기, 최초 속성 초기 연결. 별도 기기 연동 제어 기본 OFF, ON/OFF별 대상/명령 및 서비스 최신 상태 검증. 일반 패키지 동일 버전 제한 유지, 내장 코드 일치 시 주소 변경만 허용. CI #1435·입력 #553·Windows #49 성공. 2.0.46 후보: 오른쪽 기본/플러그인 그룹 제목 여백 4/3px, 기존 도움말 버튼 유지·공통 대화상자 원복. 0.1.8 계약 fixture→0.1.9 주소/토큰/기본 OFF 보존 검사 추가. CI #1437·Windows #50 성공, 2.0.46 게시. 실기 GUI 별도.
- 2.0.47 후보: 독자 SDK 속성 DeckForge/액션명, 클릭형 ⓘ 도움말·상시 설명줄 제거, 상태 원/관리 버튼 상단 한 행, 라벨 84px·기준 기기, 기존 저장/인증/센서 앵커 유지. 도움말 비커밋 시험 추가. CI #1439·SDK #131·입력 #554·Windows #51 성공, 사용자 화면 확인.
- 2.0.48~49 HA 기타/검색 UI·이전 검증 이력 Git 보존.
- **10C 판정:** 자동 검증/설치본 통과, 정식 SDK 1.0 출시 보류. 실제 HA/D200X/OS 절전·재연결/실기 장시간 사용, identity GUI 별도; Model2 자동 soak/OOM 및 설정 저장 검사 통과, 1.1.234 Windows 통합 검사 통과, 전원 손실/제품 IPC 실기 별도. Model5 연구 보류, KEY 기본 OFF, 기존 미리보기 유지.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](DECKFORGE-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
