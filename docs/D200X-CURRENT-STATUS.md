# DeckForge 현재 작업 상태
> 2026-11-26 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.42** (GitHub 마퀴·자동 조회; 2.0.7 센서 UI 사용자 정상 확인).
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
- 04B Worker #2 (45647115750) 실제 로그: data: origin=null, IndexedDB/CacheStorage/OPFS/localStorage 및 fetch/import/WSS 차단, 서비스 생존·hang 복구 통과. nestedSelf/nestedData 허용으로 부적격. 별도 WASM JS VM 시험 코드 추가: QuickJS 0.32.0(https://www.npmjs.com/package/quickjs-emscripten, MIT), 임시 CI 설치·scripts 금지·삭제, Node Worker에서 host API 차단/async JSON/8MiB heap/500ms interrupt/128 jobs/출력 한도/복구 검사. Worker #3 (45647584268) 실제 Node guest 시험 전부 통과. 동일 guest 검사 공통화 및 Chromium Worker 시험 추가: WASM 전용 CSP, 브라우저 번들 임시 생성, 외부 JS eval/중첩 차단·서비스 PID 분리 확인. 새 결과 대기; 전체 API·DrawOps·보안 검토 별도. 제품 변경 없음.
- 04B #46 실제 Electron 45.2.3/Chromium 156: standard 저장소 3종 허용, opaque 생성 실패, sandbox 후보 render frame disposed; 모두 부적격. 제품 OFF. 시험용 변경이 동일 버전 설치본 재게시를 유발해 release 보호로 #46 실패. 독립 Worker 검증 workflow 분리 완료(읽기 권한만, 배포 단계 없음), 통합 빌드는 제품 변경 시 기존 Worker 검사 유지. 독립 Worker #1 (45646799413) 실행 성공, 3종 모두 부적격 재확인. 기존 설치본 보존.
- 2.0.42: 독자 SDK tick/periodic request/WebSocket rate/backpressure 경과 시간 monotonic clock 전환. 시스템 시계 ±24시간 변경 중 제한 유지 집중 검사 추가. 설정 receipt wall clock 계약 보존. CI #1407·Windows #45·SDK #99 성공, 2.0.42 설치본 게시 확인.
- 2.0.41: 독자 서비스 관리 중 종료 시 설정 읽기/쓰기 이후 재생성 차단. 이미 확정된 설정 보존. 읽기 중 종료/저장 확정 후 종료 집중 검사 추가. CI #1405 및 Windows #44 성공.
- 2.0.40: 독자 서비스 시작 정책 동시 읽기 경쟁 해결. 공통 Promise 완료 전 서비스 시작 차단, 정지/오류 정책 보존, 동시 읽기 회귀 검사 추가. CI #1403 성공, Windows #43 진행 중. 외부 호환 엔진 추가 개발 보류.
- SDK #93 실제 OOM 통과(reason=oom), 서비스/peer 생존, 입력 복구 및 5분 soak(1391 press/105 전환/274 tick), 임시 ProfileStore 장애 검사 통과. CI #1401 성공. 실제 장치/OS 절전 및 전원 손실 별도.
- 2.0.35~39 이전 수정 및 검증 이력은 Git에서 확인. 기존 외부 호환 기능 유지, 추가 개발 보류.
- SDK 10C: #84/#88/#90 실제 5분 soak 및 장애 복구 통과, OOM 통지 미확보. #93에서 로컬 Crashpad 초기화 후 실제 oom 확인. 제품 보안 제한 유지. Model5 저장소 격리 실패는 별도.
- 2.0.34: GitHub 0.1.1 번호 23px/상태 26px, 이름 마퀴 1~3초, 자동 조회 5/15초 또는 고정 5/10/15/30초, 기존 PAT binding 유지. 독립 pollIntervalMs 5초 이상, 집중 검사 추가. Windows #37 성공; 실기 미검증. 후속 GitHub 기능은 로드맵 보류.
- 사용자 승인: 독자 HA 플러그인 기본 내장 설치, 별도 HA 추가 버튼 제거, 서버/인증 설정 및 기존 등록 데이터 보존. 별도 대기.
- 작업 체크포인트: f718990 2.0.22 명령 관리자 카드/페이지 슬롯/편집기 hover 캐시 설명, ⓘ 상세 경로 제거·설명 표시, 오프라인/늦은 응답 방지. 2.0.21 Windows 성공, 사용자 1555 설명 저장·아이콘 659 실패 보고. 2.0.22 자동 빌드/GUI 미확인. 아이콘 실패 진단 별도.
- **10C 판정:** 자동 검증/설치본 통과, 정식 SDK 1.0 출시 보류. 실제 HA/D200X/OS 절전·재연결/실기 장시간 사용, identity GUI 별도; Model2 자동 soak/OOM 및 설정 저장 검사 통과, 1.1.234 Windows 통합 검사 통과, 전원 손실/제품 IPC 실기 별도. Model5 차단, KEY 기본 OFF, 기존 미리보기 유지.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](DECKFORGE-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
