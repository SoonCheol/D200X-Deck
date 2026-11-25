# DeckForge 현재 작업 상태
> 2026-11-25 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **2.0.6** (실제 Electron 다중 버튼 검증; 2.0.3 게시 확인).
- 감사 기준 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공; Windows #930 사용자 인수인계.
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.8 후보 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 감사 19/13행 소스 대응표 작성, 잔여 GUI·실제 장애 별도. 현재 root 45개 suite 등록 및 실제 실행 로그 대조 완료.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01~04A: 검증 인벤토리·instanceId/mountGeneration·공통 합성기·Model 2 실행 격리 구현 및 집중/Windows 검사 통과. 1.1.183 깜박임 국소 개선, 04B 별도. 상세 SDK 계약 및 Git 참조.
- 02~03: UUIDv4·세대 검증·렌더 합성/dirty loop·Fusion 중복 갱신 차단 구현. 사용자 1.1.182 편집기 깜박임 해소 확인, 물리 버튼 깜박임 없음. 개별 키 USB 기본 OFF, HA 제어 재실행 금지. 상세 이력은 Git/SDK 계약.
- 04A Model 2: service/button partition·runner 재사용, lane 직렬화·lease 취소·idle LRU/30초·suspend/close·realm reset. legacy 복귀 DECKFORGE_SDK_RUNNER=legacy, 실패 이벤트 재실행 금지. 1.1.189 Windows 성공; 1.1.230 실제 장애 검증 통과.
- 04B 선행 검증: 전용 Electron CSP/격리 검사만, 실제 앱 Worker 미등록.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- 1.1.194~196: 미저장 이동/물리 초안 보호, configRevision/요청 ID/ABA 보호. 후속 05B/C 확장.
- 1.1.197: HA 0.1.4 투명 control/sensor 이미지, 동일 서버 업데이트 필요. Windows/CI 성공.
- 1.1.198~199: HA 센서 단일 편집·순서·실시간 레이어, 1.1.199 Windows/CI/입력 성공.
- 1.1.200: 05B 프로필 atomic 설정+receipt, ACK 영구 증거, 24h/4096건. Windows/CI/입력 성공. 1.1.201 Windows/CI/입력 성공(실기 실패와 구분).
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
- 1.1.202~204: 05C 저장 재조회·결과/child exit·최신 mount/ABA 검증. Windows/CI 성공. 전원 손실·감사 13개 전체 대조 미검증.
- 1.1.205~207: WSS 연결 세대/갭·종료 큐, HA catalogue/live 분리, tickWhen 조건 및 자동 회전. Windows #961·CI #1255·입력 #507 성공. 실기 별도.
- 1.1.208~211: 범용 속성/제목 정책 및 상태별 검사, CI #1256/1259·Windows #962/965 성공.
- 1.1.212~213: HA 범용 제목/단일 전경 카드 선언 및 기존 데이터 이관, CI #1260~1261·입력 #510~511·Windows #966~967 성공.
- 1.1.214~216: 데이터 유지 제거/재설치, 누락 표시, 명시 purge 및 보존 범위 검사. CI #1262~1264·입력 #512~514·Windows #968~970 성공.
- 1.1.217~218: 선택 복원/인증정보 보호 및 호환 관리. #971 성공, #972 제목 실패 후 219 수정.
- 1.1.219~220: PAGE ZIP 캐시·공통 관리창·AI plugin_log. CI #1267~1268·입력 #517~518·Windows #973~974 성공.
- 1.1.221: KEY 후보 기본 OFF, 단일 일반 키·16회 한도·실패 시 PAGE 복원. CI #1269·Windows #975 성공. 실제 KEY 미검증.
- 사용자 실기 보고: 테스트 플러그인 v1.0.0 제거 성공 2026-11-24 16:38:12 UTC, 보존 데이터 삭제 성공(2/2) 16:38:16 UTC; AI 로그 조회 확인. 원본 로그 직접 열람은 아님.
- 1.1.222: 오래된 압축 실패 시 최신 PAGE 보존, 절전 중 전송 보류/깨우기 전체 복원, 종료 후 지연 HID 연결 차단, KEY 실패 재연결 mock 검증 추가. CI #1270·Windows #976 성공. KEY 기본 OFF 유지.
- 1.1.223: purge 성공 뒤 정확한 pluginUUID 등록 액션 전체 프로필/템플릿 정리, 기존 버튼 위치/다른 액션 유지, 저장 실패 시 UI 원복. 이미 삭제된 누락 ID는 설치/보존 부재 재검사 및 명시 승인 후 정리. 사용자 데이터 직접 조작 없음. CI #1271·입력 #519·Windows #977 성공. GUI 별도.
- 1.1.224: --test-key-transport 실행 인자에서만 KEY 허용, 동일 페이지 native 단일 일반 키 부분 렌더만 liveOnly 전달. 일반 실행/와이드 경고는 PAGE. USB log 구조화 slot/ZIP bytes/session, AI 조회, 집중 검사 추가. CI #1272·입력 #520·Windows #978 성공, 설치본 게시 확인. 실제 KEY 미검증.
- 1.1.231: identity 19행 대조·집중 검사, CI #1281/입력 #521/Windows #985 성공, 게시. 1.1.232: 저장 13행 대응·종료 commit 차단. CI #1282/입력 #522 성공, Windows #986 clean fixture 실패(kind 누락), 종료/페이지·삭제/retire 검사 통과. 1.1.233: fixture 수정 CI #1283/Windows #987 성공, 게시. 1.1.234: 실제 Electron NativePluginHost+임시 ProfileStore, 요청 전/저장 후 ACK 전 renderer crash, 재조회·재실행 금지 검증 추가. CI #1284·Windows #988 성공, 1.1.234 설치본 게시.
- 1.1.226: Model2 실제 반복/자원 제한/서비스 생존·복구, opaque storage/CSP 검사 및 USB mock 통과. CI #1274·Windows #980 성공. OOM 별도. 세부 수치 SDK 계약.
- 1.1.230: CI #1278, Windows #984 attempt2 전체 성공. 실제 idle/active crash·거부·서비스/peer 생존·새 이벤트 복구, 25함수·vault 통과. 1차 npm 404 해소(버전 변경 없음). deckforge-v1.1.230 게시, EXE 135231273 bytes. 현재 root suite 45/45 실행 명령 확인, 초기 helper skip 3개와 후속 패키지 검사 구분.
## 다음 작업
- 작업 체크포인트: 0dda6a5 반복 검사 CI 45540667996 성공. 2cee88b Windows SDK 전용 workflow 추가. b3dc623 5분 opt-in soak/이벤트 누적 제한, 02e25f9 전용 workflow 활성화. Windows 실행 및 heap 판정 미확인. 다음: soak 결과 분석/OOM. 버전 2.0.6 유지.
- 2.0.1~2.0.3 CI/Windows 성공, 2.0.3 게시. 2.0.4 CI/root 회귀 성공. 동시 반영 2.0.5 독자 mount 선등록·snapshot 보존, CI 성공·Windows 진행. 2.0.6 실제 Electron 13키×4 입력·페이지 전환·모의 절전복귀·서비스/메모리 검사 추가, 실행 대기. 실기·OOM·장시간 soak 별도. SDK 10C 계속.
- **10C 판정:** 자동 검증/설치본 통과, 정식 SDK 1.0 출시 보류. 실제 HA/D200X/OS 절전·재연결/장시간 soak, 실제 OOM, identity GUI, 설정 저장 13행 추가 검사 통과, 1.1.234 Windows 통합 검사 통과, 전원 손실/제품 IPC 실기 별도. Model5 차단, KEY 기본 OFF, 기존 미리보기 유지.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](DECKFORGE-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
