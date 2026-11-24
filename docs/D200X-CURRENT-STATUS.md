# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 스냅샷, 누적 금지.
## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **1.1.223** (완전 삭제 등록 액션 정리 후보).
- 감사 기준 소스 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공(커넥터 확인); Windows #930 성공(사용자 인수인계, 이번 문서 작업에서 재검증하지 않음).
## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.8 후보 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 전체 19개 경로 및 44개 테스트 독립 검증은 미실시.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01~04A: 검증 인벤토리·instanceId/mountGeneration·공통 합성기·Model 2 실행 격리 구현 및 집중/Windows 검사 통과. 1.1.183 깜박임 국소 개선, 04B 별도. 상세 SDK 계약 및 Git 참조.
- 02~03: UUIDv4·세대 검증·렌더 합성/dirty loop·Fusion 중복 갱신 차단 구현. 사용자 1.1.182 편집기 깜박임 해소 확인, 물리 버튼 깜박임 없음. 개별 키 USB 기본 OFF, HA 제어 재실행 금지. 상세 이력은 Git/SDK 계약.
- 04A Model 2 후보: 플러그인별 service/button 분리 partition·renderer 재사용, lane 직렬화, 실행 lease 취소, idle LRU/30초 만료, suspend/close 정리. 기존 context FIFO·검증·realm reset 유지. legacy 복귀는 DECKFORGE_SDK_RUNNER=legacy (실패 이벤트 자동 재실행 금지). 집중 Node/실제 Electron PID·timeout/realm/서비스 생존 검사 추가. 1.1.188 실제 Electron PID 3844/3472 분리, timeout·서비스 생존 및 Node 검사 통과, 설치본 생성 성공, Releases HTTP 403 게시 실패. 1.1.189 Windows 전체 성공; CSP 결과 로그 미출력.
- 04B 선행 검증: 전용 Electron CSP/격리 검사만, 실제 앱 Worker 미등록.
- 1.1.190: Model 5 DrawOps 신뢰 painter 후보, 생산 경로 미변경. 후속 1.1.193에서 픽셀/host 검증 통과.
- 1.1.191~193: 카드 외곽 팝업 위치 규격, Windows 성공.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- 1.1.194~196: 미저장 이동/물리 초안 보호, configRevision/요청 ID/ABA 보호. 후속 05B/C 확장.
- 1.1.197: HA 0.1.4 투명 control/sensor 이미지, 동일 서버 업데이트 필요. Windows/CI 성공.
- 1.1.198~199: HA 센서 단일 편집·순서·실시간 레이어, 1.1.199 Windows/CI/입력 성공.
- 1.1.200: 05B 프로필 atomic 설정+receipt, ACK 영구 증거, 24h/4096건. Windows/CI/입력 성공. 1.1.201 Windows/CI/입력 성공(실기 실패와 구분).
- **HA 사용자 실기 정정:** 기존 배경색 미표시는 HA 0.1.3 미업데이트가 원인, 업데이트 후 정상 작동 사용자 확인. 이전 배경색 결함 보류 해제. 기타 UI 개별 검증은 별도, SDK 로드맵 우선.
- 1.1.202: 05C-1 읽기 전용 재조회, 미확정 저장 차단, 디스크/IPC 모의 장애. Windows/CI/입력 성공.
- 1.1.203: 선택 settingsResult·child exit 검사, Windows/CI 성공.
- 1.1.204: 05C-3 최신 mount 의도·ABA/slot/gesture·이동/복제·복합 효과 검사. Windows/CI/입력 성공. 감사 원문 13개 전체 대조/실제 전원 손실 미검증.
- 1.1.205~207: WSS 연결 세대/갭·종료 큐, HA catalogue/live 분리, tickWhen 조건 및 자동 회전. Windows #961·CI #1255·입력 #507 성공. 실기 별도.
- 1.1.208: 07A settingsUI 별도 선언(그룹·조건·정수 슬라이더) 및 색상 값 타입, 기존 form 재사용. 숨겨진 필드는 기존 값 유지; 비HA 예제 및 집중 검사 추가. CI #1256·입력 #508·Windows #962 성공; GUI 별도.
- 1.1.209~211: 범용 제목 정책 및 상태별 검사, VM 오류 수정 후 Windows #965·CI #1259 성공.
- 1.1.212~213: HA 범용 제목/단일 전경 카드 선언 및 기존 데이터 이관, CI #1260~1261·입력 #510~511·Windows #966~967 성공.
- 1.1.214~216: 데이터 유지 제거/재설치, 누락 표시, 명시 purge 및 보존 범위 검사. CI #1262~1264·입력 #512~514·Windows #968~970 성공.
- 1.1.217: 선택/전체 복원 결과 SDK 참조(비활성/템플릿 포함) 읽기 전용 점검·누락/의존성/미확인 안내. 전체 복원 허용 필드 명시, 외부 code/vault 미복원·로컬 유지, 별도 승인/재인증 안내. 집중 검사 추가. CI #1265·입력 #515·Windows #971 성공.
- 1.1.218: 사용자 요청으로 모든 플러그인 ? 도움말 하단에 제거 버튼 통합. Stream Deck 호환 코드 폴더 보존 이동/해시 확인 재설치, 자동 내장 재설치 방지, 인증/외부 애드인 유지. native만 명시 purge 지원. CI #1266·입력 #516 성공, Windows #972 실패(HA 도움말 제목 리터럴 회귀).
- 1.1.219: HA 도움말 기존 제목 복구. 09A 완전 14슬롯+wide mode SHA-256 서명 기반 8MiB 단일 ZIP 캐시, 재연결/깨우기 전체 PAGE 유지, 전송 실패 캐시 무효화, ZIP 바이트 진단. KEY 전송 비활성, CI #1267·입력 #517·Windows #973 성공.
- 1.1.220: 설치/보존 ? 공통 관리창, native 제거 방식 선택과 보존 삭제 확인 연결, 제거와 purge 결과 분리. main 사용자 설치/업데이트/제거/복구/purge 결과·취소·오류 단계 bounded 로컬 로그, AI plugin_log 조회(허용 필드). 기존 버튼 자동 삭제 없음. CI #1268·입력 #518·Windows #974 성공.
- 1.1.221: transport KEY 후보(테스트 생성자 opt-in과 liveOnly 명시 필요, production 미연결), blank 같은 PAGE에서 일반 1슬롯만, 16회 한도·전체 요청 무효화·실패 시 프로세스 내 비활성 및 전체 PAGE 복원. 집중 검사 추가. CI #1269·Windows #975 성공. 실제 KEY 미검증.
- 사용자 실기 보고: 테스트 플러그인 v1.0.0 제거 성공 2026-11-24 16:38:12 UTC, 보존 데이터 삭제 성공(2/2) 16:38:16 UTC; AI 로그 조회 확인. 원본 로그 직접 열람은 아님.
- 1.1.222: 오래된 압축 실패 시 최신 PAGE 보존, 절전 중 전송 보류/깨우기 전체 복원, 종료 후 지연 HID 연결 차단, KEY 실패 재연결 mock 검증 추가. 자동 검사 대기. KEY 기본 OFF 유지.
- 1.1.223: purge 성공 뒤 정확한 pluginUUID 등록 액션 전체 프로필/템플릿 정리, 기존 버튼 위치/다른 액션 유지, 저장 실패 시 UI 원복. 이미 삭제된 누락 ID는 설치/보존 부재 재검사 및 명시 승인 후 정리. 사용자 데이터 직접 조작 없음. 자동 검사 대기.
## 다음 작업
- **09 USB:** 09C 자동 검사 후 제한적 실기 probe 및 10 통합 검증. KEY 기본 OFF. HA 실제 서버 별도. Model 2 유지; 04B 저장소 격리·OOM·자원 한도 검증 전 Model 5 활성화 금지. 기존 실기 미리보기 정책 유지.
- 이후 02 식별자 → 03 이미지 → 04A/B 실행 엔진 → 05 저장 → 06 통신 → 07 범용 schema → 08 관리 → 09 USB → 10 출시 검증.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.
## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](D200X-STREAMDECK-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
