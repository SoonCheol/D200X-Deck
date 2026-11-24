# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 스냅샷, 누적 금지.

## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **1.1.195** (버튼 단위 편집 세션).
- 감사 기준 소스 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공(커넥터 확인); Windows #930 성공(사용자 인수인계, 이번 문서 작업에서 재검증하지 않음).

## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.3 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- HA 기존 실기 인증·기기 목록·전등 제어·센서 표시 성공, 최신 실기 별도.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 전체 19개 경로 및 44개 테스트 독립 검증은 미실시.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01 검증 기준선: 기존 44개/워크플로 8개 대조, 누락 4개 확인. 2개 오래된 검사 경계 수정 및 Windows 통합 검사에 남은 8개 등록, 신규 인벤토리 검사 포함 총 45개. CI #1225 성공, Windows #932 검사(추가 등록·Fusion 포함) 및 EXE 패키징 성공, 설치 프로그램 생성 진행 중 확인. 01 소프트웨어 기준선 통과. 런타임 소스 변경 없음; 1.1.178은 기존 자동 릴리스 태그 충돌 방지용.
- 02A: sd-plugin UUIDv4, 정규화·중복 방지, 복제·복사·가져오기·템플릿·백업·AI 처리 및 집중 검사 추가. 고정 등록은 현행 로컬 override를 보존하는 복사이므로 신규 pinned ID. 1.1.179 CI #1226·입력 #486·Windows #933 성공. 02B: 세션별 mountGeneration, 커밋된 설정 기반 등록, UUID 설정 저장 방어, IPC 등록 검증·즉시 이전 mount 폐기 및 테스트 추가. 1.1.180 CI #1227·입력 #487·Windows #934 성공(릴리스 게시 포함). 03A: 버튼 DOM 유지, 디코딩 후 원자적 교체, revision/owner 검증, 공통 합성기 visual descriptor·제한 LRU/in-flight 중복 제거, 폰트 세대와 렌더 시점 캡처. 미구성 SDK mount 제외 보완. 1.1.181 Windows #935 시작 화면 모의 테스트의 prepareDeckKeyImage 미주입 실패 확인/수정. 03B: single-flight, page epoch 및 슬롯 dirty revision, 실패 후 제한 재시도, wide 동일 스케줄러, stale decode/실패 재시도 보완. 1.1.182 CI #1229·입력 #489·Windows #936 소프트웨어/설치본 생성 통과, 릴리스 게시 진행 확인. 사용자 관찰: Fusion 명령 버튼 포함 페이지에서만 Windows 편집기 전체 버튼 주기 깜박임. 물리 D200X 버튼은 이전부터 현재까지 깜박임 없음. 소스상 3초 health 조회 및 호환 플러그인 중복 시각 이벤트 전체 렌더 확인. 1.1.183: Fusion 동일 title/image/state 무시, health 전환·캐시 및 연결 갱신을 Fusion 슬롯으로 제한, 집중 검사 추가. 1.1.183 CI #1230·입력 #490·Windows #937 성공. 사용자 확인: 1.1.182에서 편집기 깜박임 사라짐. 재발 시만 최후순위 재검토. 이미 반영한 합성기/국소 갱신은 유지하고 SDK 핵심 개발을 우선. 04A 후보 개발 중. Model 5는 보안/프로세스 격리 검증 조건부 목표, 개별 키 USB 기본 OFF, HA 제어 자동 재실행 금지.

- 1.1.184: 사용자 우선 요청으로 상태 카드 팔레트 버튼을 이미지 재합성 중 유지하고 viewport 팝업·닫기 수명 연결 보완, 대표 체크 삭제 및 번호 버튼 색상 통합. 입력 #491 기존 체크 마커를 요구하는 정적 검사 실패. 1.1.185: 새 대표 번호 계약 검사로 수정, 내장 속성창/배경색 팔레트 체크서클 및 탭 좌측 여백 반영, CI #1233·입력 #492 성공, Windows #939 기존 이미지 교체 방식 정적 검사 실패. 1.1.186: 해당 검사 새 artwork 보존 방식에 맞춤, 기존 18px 대칭 텍스트 그리드 복구, 체크만 3px 내부 이동, 탭 전체 클릭 및 독립 체크 분리. 공통 클릭 영역/여백 UI 계약 추가. 전체 기존 화면은 미전수 확인, 자동 검사/GUI 확인 대기.

- 1.1.186 CI 및 입력 검사 성공, Windows 통합 검사 149/150: 이전 overlays 정적 조건 잔존. 1.1.187에서 실제 팔레트·번호 DOM 보존 동작 검사로 교체. 런타임/UI 변경 없음, Windows 빌드 성공 확인.

- 04A Model 2 후보: 플러그인별 service/button 분리 partition·renderer 재사용, lane 직렬화, 실행 lease 취소, idle LRU/30초 만료, suspend/close 정리. 기존 context FIFO·검증·realm reset 유지. legacy 복귀는 DECKFORGE_SDK_RUNNER=legacy (실패 이벤트 자동 재실행 금지). 집중 Node/실제 Electron PID·timeout/realm/서비스 생존 검사 추가. 1.1.188 실제 Electron PID 3844/3472 분리, timeout·서비스 생존 및 Node 검사 통과, 설치본 생성 성공, Releases HTTP 403 게시 실패. 1.1.189 Windows 전체 성공; CSP 결과 로그 미출력.

- 04B 선행 검증: 별도 Electron 테스트 프로세스에서 standard/opaque 전용 scheme, host/worker 개별 CSP, AsyncFunction, 네트워크·저장소·중첩 Worker·Node 차단, timeout 후 재실행·서비스 생존·PID 검사. 결과 로그 MODEL5_WORKER_CSP_PROBE. 실제 앱에 scheme/Worker 등록 없음, 부정 결과도 기록하고 Model 2 유지. Windows 검사 대기. 기존 SDK Node 검사 exit code 누락 보완.

- 1.1.190: Model 5 전용 DrawOps 호스트 JSON/명령/개수/메모리/출력 검증, Worker 원시 픽셀 거부, 신뢰 painter 및 취소 검증, 기존 host 효과 검증 호출 계약. 기존 Model 2 실행 경로 미변경. Node 경계 테스트·실제 Electron 픽셀 동등성 추가, 실행 결과 대기. 1.1.190 Node 95/95, Electron 픽셀 비교 이후 테스트 가상 manifest 누락으로 실패.

- 1.1.191~193: 카드 전체 오른쪽 외곽 +8px/상단 정렬을 배경색·글꼴·라이브러리·특수문자 자체 팝업에 적용, OS 파일 선택 제외. 1.1.193 CI/입력/Windows 성공, 카드 위치 회귀 검사 통과; GUI 별도.
- 04B 실제 Electron: Model 2 PID 5668/844 및 realm/timeout/서비스 생존, DrawOps 픽셀/host 경계 통과. standard Worker 저장소 IndexedDB/CacheStorage/OPFS 허용, opaque Worker 생성 실패. Model 5 비활성 유지. 로드맵에 따라 05 선행 분석만 수행.
- 1.1.194 사용자 실기 보고: 배경색 팔레트 체크·색 선택 시 미저장 이동 경고 및 설정 복귀 의심. body 팔레트가 캡처 단계 외부 클릭 보호에서 누락된 원인 확인. 편집 내부 대상으로 분류하고 실제 외부 이동 보호 유지, 집중 동작 검사 추가. 빌드 및 GUI 대기.

- 1.1.195: 동일 물리 버튼의 일반 누르기 등록/교체, 노브 제스처 등록/내부 삭제를 초안으로 유지. 카드 자체 팝업 편집 범위 공통화. 기존 외부 이동/전역 관리 보호 유지, 저장/취소/탭 전환 및 외부 이동 동작 검사 추가. 자동 빌드 및 GUI 대기.

## 다음 작업
- **05 설정 저장 안정성:** 1.1.195 기능 회귀 검증 후 Model 2 유지 상태에서 requestId/revision/세대/receipt 구현. 04B 저장소 격리 해결은 별도 검증 대상으로 유지. OOM/DrawOps/자원 한도·실기 미검증 상태에서 Model 5 활성화 금지. 편집기 깜박임 개선/GUI 재확인은 최후순위이며 다음 단계의 선행조건 아님. 기능·보안 회귀는 예외적으로 즉시 해결. 성능/D200X 실기 검증 별도. 기존 실기 미리보기 정책 유지. 설정 revision/receipt 상세는 05에서 계속. 사용자 연속 개발 승인 유지.
- 이후 02 식별자 → 03 이미지 → 04A/B 실행 엔진 → 05 저장 → 06 통신 → 07 범용 schema → 08 관리 → 09 USB → 10 출시 검증.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.

## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](D200X-STREAMDECK-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
