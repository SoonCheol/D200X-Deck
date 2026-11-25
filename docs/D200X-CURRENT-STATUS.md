# DeckForge 현재 작업 상태
> 2026-11-25 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.36** (GitHub 마퀴·자동 조회; 2.0.7 센서 UI 사용자 정상 확인).
- 감사 기준 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공; Windows #930 사용자 인수인계.
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.8 후보 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 감사 19/13행 소스 대응표 작성, 잔여 GUI·실제 장애 별도. 현재 root 45개 suite 등록 및 실제 실행 로그 대조 완료.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 04A Model 2: service/button partition·runner 재사용, lane 직렬화·lease 취소·idle LRU/30초·suspend/close·realm reset. legacy 복귀 DECKFORGE_SDK_RUNNER=legacy, 실패 이벤트 재실행 금지. 1.1.189 Windows 성공; 1.1.230 실제 장애 검증 통과.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
- 1.1.221: KEY 후보 기본 OFF, 단일 일반 키·16회 한도·실패 시 PAGE 복원. CI #1269·Windows #975 성공. 실제 KEY 미검증.
- 사용자 실기 보고: 테스트 플러그인 v1.0.0 제거 성공 2026-11-24 16:38:12 UTC, 보존 데이터 삭제 성공(2/2) 16:38:16 UTC; AI 로그 조회 확인. 원본 로그 직접 열람은 아님.
- 1.1.231: identity 19행 대조·집중 검사, CI #1281/입력 #521/Windows #985 성공, 게시. 1.1.232: 저장 13행 대응·종료 commit 차단. CI #1282/입력 #522 성공, Windows #986 clean fixture 실패(kind 누락), 종료/페이지·삭제/retire 검사 통과. 1.1.233: fixture 수정 CI #1283/Windows #987 성공, 게시. 1.1.234: 실제 Electron NativePluginHost+임시 ProfileStore, 요청 전/저장 후 ACK 전 renderer crash, 재조회·재실행 금지 검증 추가. CI #1284·Windows #988 성공, 1.1.234 설치본 게시.
- 1.1.230: CI #1278, Windows #984 attempt2 전체 성공. 실제 idle/active crash·거부·서비스/peer 생존·새 이벤트 복구, 25함수·vault 통과. 1차 npm 404 해소(버전 변경 없음). deckforge-v1.1.230 게시, EXE 135231273 bytes. 현재 root suite 45/45 실행 명령 확인, 초기 helper skip 3개와 후속 패키지 검사 구분.
## 다음 작업
- 2.0.37 예정: 호환 플러그인 startup 대기 중 최신 페이지 변경 시 이전 mount 즉시 퇴역, await 이후 이전 세대 sync 중지. 기존 관리 직렬화 및 충돌 검증 유지.
- 2.0.35: 실행/설치 충돌 검증용 catalogue와 UI artwork 조회 분리. 아이콘 읽기 실패 시 검증된 ID 유지 및 개별 이미지 null. manifest/CodePath 검증 유지. CI #1392 성공, Windows #38 소스 패턴 검사 실패. 2.0.36: 아이콘 fallback 패턴 검사를 새 helper에 맞추고 충돌 fixture를 유효 native ID로 수정. 제품 코드 변경 없음. Windows #39 attempt2 성공. 외부 catalogue/관리 큐 의존은 남음.
- SDK 10C 재개: Windows #37 성공(2.0.34). 전용 SDK #78은 soak/OOM skip. #9 실제 로그: 장시간 테스트 service/button PID assertion 실패, OOM skip. 유휴 runner 30초 정리와 정적 service fixture 불일치 가능성. `0846974`에서 실제 1초 service tick·soak tick count/PID 진단, OOM 독립 실행, SDK 핵심 변경 시 전용 CI 트리거 추가. 생산 소스·버전·Model5/KEY 정책 미변경. SDK #84 실제 5분 soak 성공: 1417 press/107 전환/293 service tick, host heap 표본 6.7~13.8MB, runner 2개. OOM 실패: reason=crashed, exitCode=-36861(Chromium Crashpad 미연결 코드, OOM 증거 아님). 시험 전용 Chromium 파일 로그의 대상 PID/native Blink V8 javascript OOM 메시지 또는 Electron oom 이벤트만 허용; 장애 후 서비스/peer/새 입력 복구를 먼저 검증. 새 검사 대기. 실제 HA/D200X/OS 절전·전원 손실 별도.
- 2.0.34: GitHub 0.1.1 번호 23px/상태 26px, 이름 마퀴 1~3초, 자동 조회 5/15초 또는 고정 5/10/15/30초, 기존 PAT binding 유지. 독립 pollIntervalMs 5초 이상, 집중 검사 추가. Windows #37 성공; 실기 미검증. 후속 GitHub 기능은 로드맵 보류.
- 2.0.33: GitHub 개발 현황 0.1.0 관리 메뉴 내장 설치, 단일 저장소/워크플로/브랜치, 읽기 PAT vault, 30초 조회·한글 상태/빌드 번호·누르면 새로고침. GET 선택 32KiB 응답/6 pathKeys/User-Agent, 집중 검사 추가. Windows #36·CI #1384·SDK #76·입력 #550 성공, 사용자 #36 빌드 성공 표시 확인, 일회성 실행 다운 원인 미확인; 순환/길게 누르기 별도.
- 2.0.30: Windows 경로 정규화 native, 양측 SDK 등록 완료 후 appear 단일 전달, Node 오류 분류(원문 미기록), 실행 중 로그 변화 허용·종료 대기·rename 재시도, 삭제 실패 팝업. 집중 검사 추가. Windows #33·CI #1378·SDK #70·입력 #549 성공, 실제 GPU·삭제 확인 대기.
- 2.0.27: 제거된 타이틀 숨김, 관리 메뉴 완전 삭제(독자/Stream Deck), 설치된 Stream Deck 제거 시 완전 삭제 선택. ID/보존 원본·전역 설정 재검사, 삭제 성공 후 등록 액션 정리. 집중 테스트 추가, Windows #30·CI #1372·SDK #64·입력 #546 성공, GUI 대기. 2.0.26 Windows #29 성공. HA 내장 및 파일 필터 개선 별도 대기.
- 사용자 승인: 독자 HA 플러그인 기본 내장 설치, 별도 HA 추가 버튼 제거, 서버/인증 설정 및 기존 등록 데이터 보존. 별도 대기.
- 작업 체크포인트: f718990 2.0.22 명령 관리자 카드/페이지 슬롯/편집기 hover 캐시 설명, ⓘ 상세 경로 제거·설명 표시, 오프라인/늦은 응답 방지. 2.0.21 Windows 성공, 사용자 1555 설명 저장·아이콘 659 실패 보고. 2.0.22 자동 빌드/GUI 미확인. 아이콘 실패 진단 별도.
- **10C 판정:** 자동 검증/설치본 통과, 정식 SDK 1.0 출시 보류. 실제 HA/D200X/OS 절전·재연결/장시간 soak, 실제 OOM, identity GUI, 설정 저장 13행 추가 검사 통과, 1.1.234 Windows 통합 검사 통과, 전원 손실/제품 IPC 실기 별도. Model5 차단, KEY 기본 OFF, 기존 미리보기 유지.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](DECKFORGE-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
