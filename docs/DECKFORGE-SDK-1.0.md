# DeckForge 독자 SDK 1.0 — 출시 후보 계약

상태: **SDK 1.0 선언 보류 / 재설계 기준 확정**. 아래 기존 구현 계약은 유지하며 재설계 절은 구현 목표로 구분한다. 이 문서는 기존 개발 이력의 최신 독자 SDK 계약을 정리한다. SDK 제품 버전 1.0은 native.json의 apiVersion(1: 선언형, 2: JavaScript)이나 패키지 formatVersion(2)과 별개다. DeckForge 독자 SDK가 주력 규격이며 외부 Stream Deck/Ulanzi 호환성은 별도 과제다. 외부 SDK 규격은 호환 계층으로 한정한다. 독자 실행이 호환 엔진에 종속되지 않는 것을 목표로 하며 실제 독립 실행 여부는 별도 감사 전 확정하지 않는다.

## JavaScript 공개 API 25개 (API 2, 1.0 기준선 19개 + 확장 6개)

| 함수 | 권한 | 계약 |
|---|---|---|
| setTitle(text) | display | 문자열 256자 이하 |
| setState(index) | display | 등록 상태 범위 0/1 |
| toggleState() | display | 2상태 액션 |
| setImage(dataUri) | display | 검증 PNG 또는 제한 SVG, GIF 재생 중지 |
| setAnimation(gifDataUri) | display | 일반 키 0~12, 최대 32프레임/전체 1M 픽셀, 4개 활성/8MiB, 최소 500ms |
| stopAnimation() | display | 마지막 이미지 유지 |
| drawKey(spec) | display | 144×144 이하, rect/circle/line/text, 32명령/그림, 이벤트당 2장 |
| setSettings(object) | settings.write | 현재 액션 설정 전체 교체, 저장 receipt |
| patchSettings(object) | settings.write | 최상위 키 병합, 저장 receipt |
| getGlobalSettings() | global.settings | 현재 플러그인 전역 설정 사본, 권한 없으면 빈 객체 |
| setGlobalSettings(object) | global.settings | 암호화 저장, revision 검사 |
| goToPage(index) | navigation | 0 기반, 기존 페이지 범위 검사 |
| switchProfile(idOrDirection) | navigation | 기존 ID/next/previous |
| enterFolder(slot) | navigation | 0 기반 일반 키, 실제 폴더 확인 |
| exitFolder() | navigation | 기존 폴더 탐색 |
| setWideMode(mode) | wide.mode | clock/datetime/stats/knobs 중 활성 모드 |
| setWideOverlay(frame, durationMs=5000) | wide.overlay | 선언형 layout 또는 검증된 392×196 PNG, 1000~30000ms |
| clearWideOverlay() | wide.overlay | 소유 context의 overlay 해제 |
| request(endpoint, body=null, query?, options?) | network.request | 승인 HTTPS GET/POST/PUT/PATCH/DELETE, networkResult |
| connectSocket(endpoint, query?) | network.websocket | 승인 WSS 연결 |
| sendSocket(value) | network.websocket | 텍스트/JSON 전송 |
| closeSocket() | network.websocket | 연결 종료 |
| getSharedState() | background.run | 동일 플러그인 휘발성 상태 스냅샷 |
| publishSharedState(object) | background.run | 전역 서비스만 상태 발행 |
| sendServiceMessage(object) | background.run | 입력 이벤트에서 같은 플러그인의 서비스에 메시지 전송 |

함수는 동기적으로 명령을 제출한다. 반환값은 저장/실행 성공이 아니다. display 및 읽기 외 부수 효과는 입력 이벤트당 한 개, 예외적으로 승인 GET polling을 허용한다. API 1은 별도 선언형 6개 op(title/titleFromSetting/state/stateFromSetting/toggleState/image) 유지.

## 실행 계약

- async 함수 본문 인자 event/settings/state/memory/api. appear/disappear/settings/press/release/rotateLeft/rotateRight/heldRotateLeft/heldRotateRight, 권한형 tick, networkResult.
- event.slot/gesture는 등록된 context의 물리 위치/제스처. settings는 읽기용 스냅샷; memory는 context별 8KiB, 사라진 context에서는 보존을 보장하지 않음. state는 해당 시점 상태.
- JS 최대 64KiB, 이벤트당 16명령, 렌더러 출력 512KiB, 실행 제한 1.5초, 렌더러 초기화/리셋 별도. 파일/셸/Node/임의 네트워크/직접 타이머 미지원. 신뢰한 플러그인만 설치.
- settings.write/global.settings는 JSON 8KiB, 권한·저장 충돌·수명 검증. 저장 성공 이후 다음 입력에서 읽을 수 있음. 사용자 편집/대화상자·페이지 이탈 시 부수 효과 거부 또는 취소. 실패 입력 자동 재실행 없음.
- tickIntervalMs 1000~3600000, timer.tick 권한. network.poll + network.request + timer.tick 및 간격 5000ms 이상에서 GET polling 허용. 응답/요청 8KiB, TLS, 5초 제한, redirect 차단. 인증 토큰은 별도 OS 암호화 vault, script에 노출하지 않는다.
- 2.0.34: API2 action 선택 pollIntervalMs(5000~3600000) 및 network.poll 권한으로 1초 이상 시각 tick과 GET polling 분리. host가 실제 주기 요청 간격을 별도 제한하고, 빠른 요청은 capacity 응답. 기존 선언 없는 액션의 tick 5초 이상 제한 유지.
- settingsSchema는 boolean/text/integer/select, 최대 16필드. 기본값은 실행 시 적용, 사용자 저장 여부 별도.
- 설치/업데이트/복원·SemVer 의존성·원자적 저장 및 버전 이력은 기존 native package 계약. 패키지 생성/설치 방법은 DECKFORGE-PLUGIN-FORMAT.md의 CLI 절 참고.

## SDK 1.1 확장 — 2026-11-24 사용자 승인

1.0의 19개 API는 기준선으로 유지한다. WebSocket 및 HTTP 확장을 최고 우선순위로 별도 진행한다. DeckForge 1.1.164: 기존 request(endpoint, body=null, query?)에 PUT/PATCH/DELETE와 endpoint.queryKeys(최대 8개, 값 문자열 최대 256자, 최종 URL 2048자)를 추가. 사용자가 승인한 HTTPS origin/path/method는 고정이며 query 값만 인코딩하여 변경한다. GET body 금지, GET 전용 polling, 기존 TLS/취소/응답 한도 유지. queryKeys 변경 시 Bearer 인증정보를 새 계약에 다시 등록해야 한다. DeckForge 1.1.166: request의 4번째 선택 인자 options={path,headers}. manifest pathKeys(1~4개)로 승인한 HTTPS base 하위 단일 경로 조각만 변경(영문/숫자/._~- 128자, dot traversal 및 slash/percent 금지); headerKeys(1~8개)로 승인한 일부 표준 및 제한 x- 헤더 값만 변경(ASCII 256자, CR/LF·인증/쿠키/프록시/프레이밍 헤더 금지). 헤더·경로 계약 변경 시 기존 Bearer vault binding 분리. WSS는 기존 queryKeys만 지원. 임의 URL/임의 헤더/비밀 직접 전달은 의도적으로 지원하지 않는다.

DeckForge 1.1.165: `network.websocket` 권한과 method `WSS`, 승인된 wss:// 주소를 사용한다. `api.connectSocket(endpoint,query?)` (appear/settings/입력), `api.sendSocket(value)` 및 `api.closeSocket()` (입력/socketEvent) 3개 추가. `event.type==='socketEvent'`, `event.response={endpoint,event:'open'|'message'|'close'|'error'|'reconnecting',body,error}`. 활성 context당 1개/플러그인당 2개/전체 8개, 송수신 각각 초당 8개, 텍스트/JSON 8KiB, 송신 대기 32KiB. TLS 검증/redirect 금지/압축 금지/5초 handshake, 1.1.167부터 endpoint.reconnect:true일 때만 transient 오류/비정상 종료/heartbeat timeout에 1/3/10초 최대 3회 재연결(활성 context 수명 전체). 송신/입력 재생 없음, 연결마다 open 이벤트에서 구독 재등록. 30초 ping/10초 pong deadline, 명시 종료/설정 변경/페이지 이탈/절전 시 재시도와 타이머 모두 취소. 페이지 이탈·설정 변경·절전·오류·종료 시 해제 및 늦은 이벤트 폐기. Bearer handshake 외 1.1.167부터 auth:'home-assistant' WSS 지원: host가 auth_required→auth(access_token)→auth_ok를 처리하고 인증 성공 후에만 open 이벤트 전달. 5초 인증 제한, auth_invalid/비정상 메시지 재시도 금지. 스크립트·일반 로그에 토큰 미전달. 공식 규격 https://developers.home-assistant.io/docs/api/websocket/ 참고. 실제 HA 서비스 연결 별도 검증. 1.1.168 실제 loopback TLS HTTPS/WSS 통합 검사 추가(테스트 전용 CA, 제품 검증 정책 변경 없음). API 1/2 manifest 번호 유지, 공개 API 확장 22개. 1.1.168 CI/Windows 및 실제 로컬 TLS 통신 성공, 실제 HA 서비스/D200X 실기 미실시.

## HTTP 조회 확장 (DeckForge 2.0.33)
- GET endpoint의 선택 maxResponseBytes 8192 또는 32768. 기본 8KiB 및 쓰기 한도 유지, 원본/직렬화 응답 한도 동일 적용, credential binding에 선택 한도 포함. 승인 pathKeys 최대 6개, 기존 경로 조각 안전 검사 유지. 고정 User-Agent DeckForge 추가. GitHub Actions 읽기 전용 조회용, 실제 서버 검증 별도.

## 대량 WSS 수신 (DeckForge 1.1.171)
- endpoint.maxReceiveBytes는 WSS에만 8192(기본) 또는 262144(256KiB) 허용. 인증 메시지/송신은 기존 8KiB, 수신은 원본 및 JSON 직렬화 크기 모두 검사. 큰 메시지는 context pending 4 미만일 때만 수용하며 수신 속도/연결 수/TLS/취소 정책 유지. socket message 이벤트에 한해 renderer 입력 512KiB. 공유 상태/설정/메모리 한도는 변경하지 않음. HA 전체 목록 크기 및 동적 UI는 별도 검증/구현 필요.

## 전역 서비스 (DeckForge 1.1.169~170)

API 2 manifest의 service={script,tickIntervalMs?} 및 별도 background.run 권한이 필요. 설치 승인 후 첫 host sync에서 페이지/프로필과 무관하게 서비스 1개/플러그인, 전체 최대 8개 실행. 기존 scheduler(전체 6/플러그인 2 실행), 네트워크/WS 제한 재사용. start/settings/tick/networkResult/socketEvent, slot/gesture=null, scope:'service'. stop은 유휴 renderer의 best-effort 알림(효과 무시). 서비스는 물리 버튼 출력/설정 저장/탐색 금지; 승인 WSS 및 GET polling만 자동 실행. 페이지 이동 시 서비스 연결 유지; 제거/버전 변경/의존성 차단/절전/종료 시 취소. 복귀 시 새 start, 실패 입력 재생 없음.
- publishSharedState(object): 서비스만 허용, 8KiB 검증 JSON 전체 교체. 동일 plugin의 활성 버튼에 coalesced sharedState 이벤트, 동일 값 반복 갱신 생략. getSharedState(): 해당 plugin snapshot 사본, 권한 없으면 빈 객체. 새 페이지 appear에서도 읽음. 서비스 중지/실패/절전 시 초기화. 휘발성 상태이며 인증정보 보관용 아님.
- 1.1.170: 플러그인 목록의 전역 서비스 관리에서 시작/중지/재시작. 중지는 Plugins/NativeServicePreferences.json에 원자 저장(토큰 없음), 재실행/업데이트 후 유지. 읽기 오류 시 fail closed, 원본 보존. 시작/재시작은 의존성 검사 후 수행; 실제 연결 여부 별도 표시. 명시 중지 시 서비스만 제거하고 등록 버튼/설정은 보존.
- sendServiceMessage(object): 버튼 입력 이벤트당 기존 부수 효과 한도 내 동일 플러그인 서비스에 8KiB JSON 전달. serviceMessage 이벤트 response={actionId,message}; 서비스는 승인 HTTP/WSS 효과 1개 가능, 자동 입력 재실행/타 플러그인 전달 없음. 큐 포화/서비스 중지 시 거부. 반환은 실행 성공 아님.
- 공개 함수 25개. 1.1.169 CI/입력 자동 검사 성공, 1.1.170 신규 자동 검증 및 실제 HA/D200X 실기 확인 필요.

## 출시 기준 — 재설계 완료 후

- API 1/2 및 공개 25개 함수·예제 패키지·권한/한도·설정/암호화·기존 기능 회귀 통과. 전체 테스트 인벤토리와 CI 누락 해소.
- 실행 격리·CSP/Worker 검증 및 장애 복구, 이미지 갱신 경쟁/깜박임 및 저장 일관성, 범용 schema 비HA 예제, 플러그인 관리/데이터 보호 확인.
- Windows 통합 테스트와 장시간 안정성 실측, 실제 HA/D200X 입력·화면·재연결·절전/복귀 확인. 부분 USB는 별도 실기 검증 후에만 활성화; 실패하면 PAGE 유지.
- 미검증 기능·수치는 완료로 기록하지 않는다. 최신 상태는 CURRENT-STATUS, 단계와 롤백은 로드맵 참조.

## 1.1.172 동적 설정 및 HA 첫 후보
- service.sharedStateBytes: 기본 8192, 선택 262144. 기존 암호화 설정/메모리/송신 한도 유지. 동적 설정 dynamicSelect/dynamicMultiSelect(source, maxItems)는 service 공유 상태의 선택 목록을 검증해 편집기에 제공하며 기존 선택 보존, 검색 및 그룹 표시. 인증정보 교체 후 활성 서비스 재시작(명시 중지 보존).
- HA 전용 설치는 사용자 지정 HTTPS/WSS 주소 승인 및 별도 암호화 토큰, 기존 HA 플러그인과 공존. 기기 레지스트리/압축 상태 구독, 스위치류 및 센서 최대 4개, 동시/수동/자동 전환. 대량 목록 상한 및 실기 검증 필요. 공식 HA WebSocket 및 공개 JS client protocol 참고, 원본 코드/아이콘 미포함.

## 1.1.173 선택 상태 전달 및 HA 패키지
- API 2 action.sharedStateView={keys,map,selection}: 허용 공유 상태 최상위 키와 설정에 선택된 최대 8개 map 항목만 버튼 renderer에 복제. 관계없는 상태 변경 이벤트 생략. 기존 선언 없는 액션은 이전 동작 유지. HA 0.1.1은 이 기능 사용.
- HA 전용 추가에서 설치/업데이트 또는 서버 주소 포함 독립 .deckforgePlugin 파일 저장(토큰 미포함, 덮어쓰기 금지). 이진 센서 device_class별 상태 문구 및 Electron 센서 출력 집중 검사 추가. 실제 HA 연결·D200X 실기는 별도.

## 1.1.174 공통 속성 UI 및 HA 진단
- 독자 SDK 속성·인증창은 공통 message button/field 규격 사용. 동적 목록 창이 열린 동안 1.5초 조회, 종료 시 해제, 선택 보존 및 동일 목록 재렌더 생략. 서비스/연결/단계·안전 오류 코드 표시 및 수동 재연결. 토큰/원본 응답/임의 transport 오류 미노출.
- WSS 수신 1MiB 선택 허용 및 renderer 입력 1.5MiB, 기존 기본 8KiB·송신·인증·공유 상태 한도 유지. HA 0.1.2 적용. 실 서버 원인 확정은 아직 아님.

## 재설계 계약 — 2026-11-24 사용자 승인

기준 소스 1.1.177 / `49ba39fe094ee808c5715f2348be0789f61d5e20`. 1·2차 감사 합의 및 3차 보고서 검토를 반영한 구현 목표이며 아직 구현·검증된 기능이 아니다. 3차 보고서 전체와 핵심 소스 대조 완료; 1·2차 원문 재검토, 19개 경로 전수 확인, 44개 테스트 실행은 별도. SDK 1.0 선언 보류.

- **호환·안전:** API 1/2 및 공개 25개 함수, 권한·격리·암호화·기존 프로필/버튼/인증정보 보존. 이벤트당 권한형 부수 효과 1개 유지(`validateScriptOps`); settings/globalSettings 복합 트랜잭션은 추가하지 않는다. 기존 epoch/settingsRevision과 FIFO 자기 저장 처리 유지·확장. 입력 및 HA 제어 자동 재실행 금지.
- **정체성:** sd-plugin 액션에 영구 instanceId(UUID), 실행 mountGeneration 및 settingsRevision 분리. 이동/교환/잘라내기 첫 붙여넣기/래핑은 ID 유지, 신규/복제/복사/템플릿/AI 생성은 신규 ID. 고정 등록은 현행 코드상 로컬 override를 남기는 복사이므로 새 pinned ID를 발급하고 기존 로컬 ID는 유지한다(실제 이동인 경우 ID 유지). 제어 범위 전환의 복사도 신규 ID. 전체 복원은 유지·중복 정규화, 병합/선택 복원은 충돌 방지. 반복 마이그레이션은 기존 유효 ID 보존. 일반 액션 스키마 불필요 변경 금지. 생성·복사·이동·가져오기·중첩·고정·프로필·백업·Fusion·AI 등 감사 19개 경로를 구현 전 확인하고 테스트.
- **표시:** 편집기/USB 공통 합성기, content hash + font/version/size 기반 캐시(개수·바이트 상한), pageEpoch/slotRevision 및 non-losing dirty loop, 비동기 생성/디코딩 성공 후 기존 DOM 이미지 교체. 실패 시 정상 이미지 유지. 드래그/툴팁/누르기 번호/와이드 경고 보존. 편집 초안과 실행 설정은 분리하되 기존 실기 실시간 시각 미리보기 정책은 사용자 결정 전 변경 금지. 설정 미저장 상태에서 새 동작 실행 금지. 실제 전송 성공과 이미지 생성/요청 완료를 구분.
- **실행 엔진:** 기존 runner 유지 및 공통 인터페이스 도입. 4A: 플러그인별 service/button 분리 BrowserWindow 재사용, 직렬 실행·realm reset 및 권한 유지. 4B: service 전용 renderer + button host/단기 Dedicated Worker + 호스트 재검증 DrawOps. Model 5는 검증 전 기본 활성화 금지. partition만으로 OS 프로세스 독립을 단정하지 않고 PID·장애 전파 실측. Worker CSP/AsyncFunction 충돌 해결을 위한 제한된 검증 선행; 단순 보안 완화 금지. 네트워크/저장소/중첩 Worker/Node 접근 차단, 크기·시간·큐·메모리 제한 및 watchdog/circuit breaker. 서비스 처리 여유, 기존 전역/플러그인 제한 및 입력 순서 보존. Worker OOM/정지 시 서비스 정상 유지가 통과 조건. 실패 시 검증된 이전 runner로 복귀.
- **저장:** requestId + instanceId + mountGeneration + revision 기반 충돌 검증. 저장 성공/거절/미확정 시간 초과 구분, 요청 결과 멱등성 및 영구 저장과 결과의 일관성 확보(메모리 LRU만으로 재시작 후 보장 금지). 만료 전 쓰기/쓰기 후 응답 유실/프로그램 종료·이동·복제·ABA·저장 장애 등 13개 감사 시나리오 중 현행 계약에 해당하는 항목 검증, 복합 효과 거부도 검증. 05A: mount별 configRevision(확정 설정 변경 추적)과 내부 실행 settingsRevision(외부 변경 취소용)을 분리한다. requestId/instanceId/mountGeneration/configRevision/만료/이전 값 검증, 오래된 sync 거부, 수신 불확실 시 해당 실행만 일시 중단하고 더 새로운 확정 revision 또는 remount에서 재개(자동 재실행 없음). 05B: 메인 프로세스가 활성 host 요청에서 대상/이전값/만료를 직접 확인하고 프로필 단일 atomic replacement에 성공 receipt를 함께 저장한다. 일반 저장·백업 복원은 내부 receipt 기록을 보존하고 백업 내보내기/렌더러 읽기에서는 숨긴다. requestId 해시로 동일 요청 중복 쓰기·충돌 차단, 24시간/4096건 한도(만료 요청 및 과거 mount의 재실행 금지), 성공 ACK는 영구 기록 필수. 05C-1: 원자적 교체 후 응답 유실은 저장된 receipt와 현재 대상/값을 읽기 전용으로 대조해 확정(쓰기 재시도 금지). 이전 값과 receipt 부재가 확인된 실패만 거절, 읽기 불가·대상 변경·세대 불확실은 unknown. 미확정 렌더러의 일반 프로필 저장 차단 후 재시작 필요. 05C-2: API 2 manifest capabilities:['settingsResult']와 settings.write가 모두 있으면 같은 mount/실행 세대에 event.type='settingsResult', event.response={requestId,status:'saved'|'rejected'|'unknown'}를 FIFO로 추가한다. 취소된 이전 세대에는 전달하지 않으며 기존 manifest는 이벤트 없음. 결과 이벤트는 display/memory만 허용, 권한형 효과 금지. unknown은 일반 입력 중단 유지, 결과 알림만 허용. 재시작 후 알림 재생 없음. 프로필 atomic rename 전후 child process 즉시 종료 집중 검사 추가; 실제 Windows 전원 손실 검증 아님. 05C-3: router는 최신 mount 의도/설정 revision을 비동기 catalogue 조회 전 보존하고 더 최신 설정/이동/복제 시 대기 중 저장을 거부한다. renderer도 slot/gesture 대조. 이동·복제·프로필 복사 및 복합 settings/globalSettings 효과 전체 거부 집중 검사 추가. 감사 원문 13개 전체 독립 대조와 실제 전원 손실 검증은 별도이며 자동 검사 통과 전 단계 완료 선언 금지. 확정되지 않은 저장·제어 자동 재시도 금지.
- **통신:** 현재 WebSocket 오류 종료 처리 보존, 큐 포화에도 연결 실패/동기화 무효화 전달 보장. 일반 SDK는 연결 세대·갭 진단·공유 상태 전달 제공; 06A: socketEvent.response에 generation(연결 세대), gap(연결 종료/오류/재연결로 기존 스냅샷 무효)을 추가한다. 종료 시 이전 세대의 대기 중 데이터 폐기, 종료 알림 예약 FIFO 용량 최대 2개 및 단일 최신 보류 notice, mount/설정 변경 시 취소. 송신/입력 재생 없음. 포화 검사 추가; HA 0.1.5/06B: 재연결 중 이전 catalogue만 유지, 실시간 entities 초기화 및 제어 차단. generation/단계(devices→registry→snapshot→live) 검증, 최초 전체 상태 이벤트 뒤에만 연결됨 처리, 새 snapshot과 삭제 이벤트로 catalogue 재구성, call_service result는 실제 상태와 구분. 참고: https://contributors.home-assistant.io/core/internals/websocket-api/ subscribe_entities 계약. 실제 HA 서버 검증 별도. 기존 getSharedState/sharedStateView 계약 호환. 제어 접수와 실제 상태 확인 구분, 토글 자동 재실행·임의 연속 입력 병합 금지. 06C: API2 action.tickWhen={setting,equals,selection,minItems} 선택 선언은 schema select/boolean 일치 및 dynamicMultiSelect 최소 개수로 기존 tickIntervalMs 실행을 제한한다. 권한/주기 한도 그대로, 기존 선언 없는 manifest는 이전 동작 유지. HA 0.1.6은 auto+복수 센서에서만 tick, sharedState는 회전 시간/순서를 변경하지 않음. 집중 테스트 추가, 실제 HA 확인 별도.
- **범용 속성:** 기존 schema 호환층, 선언형 값 검증과 UI 메타 분리, 그룹/조건/슬라이더/색상/동적 목록. 제목 우선순위 사용자 명시(빈 제목 포함) > 템플릿 > 플러그인 동적 > 기본. 기존 제목·스타일·2상태 카드 보존, HA 코어 특례 제거. 별도 비HA 예제로 코어 수정 없이 작동 검증. 07A(1.1.208): action.settingsUI는 선택 배열(최대 schema 필드 수), 각 항목 key 및 선택 group/control:'slider'/visibleWhen:{key,equals}. 조건은 무조건 표시되는 boolean/select 필드의 정확한 값만 참조; 자기참조·조건 의존·미등록 키·임의 HTML 거부. slider는 integer 범위 차 1~10000(간격 1), 색상은 신규 값 타입 color(#RRGGBB). 기존 schema와 UI 없는 manifest 호환. 숨긴 필드의 초안은 적용하지 않고 저장값/기본값 유지. 기존 속성창 재사용, 비HA settings-ui 예제 추가. 제목·HA 특례 제거와 GUI 검증은 후속.
- **관리:** 제거 기본 keepData, purge 별도 명시 승인(물리적 완전 삭제 보장 금지), 의존성 검사·서비스 종료·누락 표시·재설치 복구. 기존 백업/선택/병합 유지, 외부 DPAPI vault로 유효 로컬 데이터 덮어쓰기 금지, 재인증 안내 및 신뢰 승인 전 외부 서비스 실행 금지. 인증정보 내보내기는 1.0 필수 아님.
- **USB:** 전체 14슬롯 PAGE 전송 기본 유지, 해시/PNG 캐시 개선. KEY 부분 전송은 실기에서 인접 슬롯·와이드·재연결 검증 전 기본 OFF, 오류 즉시 PAGE 복귀. USB 세션 변경 시 전체 갱신.
- **검증·롤백:** 변경 집중 검사 → 단계별 회귀 → 실행 엔진 보안/장애 주입 → 통합 soak → 실기. 미측정 숫자나 완성도 단정 금지, 기준선 측정 후 수치 목표 확정. 보안 우회·서비스 장애 전파·잘못된 설정 저장·데이터 손실·기존 기능 회귀·자원 이상 시 단계 중단 및 기능 플래그/커밋 롤백(데이터 원본 유지). USB 실기 불합격은 부분 전송 비활성화. 단계 순서·통과 조건은 [로드맵](DECKFORGE-ROADMAP.md).

### 04B Worker CSP 선행 검증 (1.1.189, 후속 연구 보류)

- 2026-11-26 사용자 승인: SDK 1.0은 Model 2만 사용. Model 5 시험 결과/보안 조건 보존, 제품 OFF, 출시 필수 경로에서 제외. 기존 Model 2 보안 보강·실기 게이트 우선. USB 개별 KEY는 별도 실기 검증 전 기본 OFF.

- 별도 Electron 테스트 실행 파일 `test/deckforge-worker-csp-electron.cjs`만 전용 scheme을 등록한다. 실제 앱의 Model 2/legacy 보안 정책은 변경하지 않는다. host CSP의 script-src는 none, worker의 응답 CSP는 unsafe-eval만 허용하고 worker-src/connect-src는 none. 두 scheme 후보의 AsyncFunction, 네트워크/스크립트 로딩/중첩 Worker, Node·저장소 차단, timeout·다음 실행·서비스 PID와 생존을 개별 기록한다.
- 참조: Electron protocol API (https://www.electronjs.org/docs/latest/api/protocol), MDN CSP Worker 정책 (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy). blob/data Worker는 부모 CSP를 상속하므로 단순 worker-src 완화는 채택하지 않는다. 결과가 부정적이거나 불확정이면 후보 부적격. 이 테스트가 통과해도 OOM·DrawOps·출력/메모리 상한 및 전체 API 회귀는 별도이며 Model 5 활성화 근거가 아니다.

- 1.1.190 DrawOps 후보: Worker 결과는 512 KiB JSON·16개 명령·2회 그리기·8 KiB memory 제한. 호스트에서 전체 그리기 명령을 먼저 검증하며 Worker 원시 pixels 금지. 신뢰 painter는 데이터만 받아 RGBA 생성, 치수/인코딩/총량 및 취소 재검증 후 기존 validateScriptOps 경계를 반드시 통과한다. 아직 Model 5 실행 연결 없음. 집중 Node 검사와 Electron 기존 drawKey 픽셀 동등성 검사 추가.

- 07B-1(1.1.209): 선택 action.titlePolicy={selectionLabel?,defaultTitle?}. selectionLabel은 dynamicSelect 필드만 참조. 사용자 직접 입력(빈 값 포함) > 현재 선택값에 대응하는 검증된 label snapshot > 동적 제목(빈 값 포함) > defaultTitle. 기존 비선언 플러그인·저장된 상태별 제목 유지. 신규 상태쌍의 자동 제목과 명시 입력 분리. HA 적용/기존 제목 이관·단일 센서 편집 일반화는 후속. 예제 및 집중 검사 추가, 실제 GUI 별도.

- 07B-2(1.1.212): HA 0.1.7 control은 titlePolicy.selectionLabel='entity', defaultTitle='기기 선택' 사용. 기존 haAutoTitle과 정확히 일치하는 제목만 자동으로 이관하며 별도 입력과 빈 제목 보존. 읽기에서는 복사본만 변환, 사용자 승인 설정/상태 편집에서 이관을 저장. 기존 설치 manifest 호환 경로 보존. 센서 전경/단일 카드 일반화는 후속.

- 07B-3(1.1.213): 선택 action.visualPolicy='foreground'는 단일 상태 Keypad 선언만 허용. 설치된 native catalogue의 plugin/action ID 일치로 선택, runtime 이미지는 사용자 배경/아이콘 위·제목 아래의 일시적 레이어, 공통 단일 카드 편집. HA 0.1.8 sensor 선언 사용; 구 HA ID와 기존 저장 데이터 이관 호환 경로 유지. 내부 sensorDisplay/sensorOverlay 및 CSS 이름은 레이아웃 보호를 위해 유지. 비HA settings-ui 예제와 검증 추가. GUI/실기 별도.

- 08A(1.1.214): 독자 플러그인 keepData 제거는 main 확인창과 현재 manifest revision, 직접 설치 의존 플러그인 부재 확인 필수. 실행 context 종료 후 현재 manifest를 NativeRemoved로 이동, 기존 및 현재 코드는 NativeHistory에 보존. 프로필·암호화 vault·서비스 환경설정 미변경. 재설치 시 보존 원본 동일 내용 또는 더 높은 호환 버전 요구. 기존 패키지 설치 신뢰 승인 유지. purge 및 누락/선택 복원 관리 후속. 실제 사용자 데이터 조작 없음.

- 08B(1.1.215): NativeRemoved 목록은 설치 목록과 분리, 설치된 ID 제외. 보존 원본 재설치는 main 권한 및 endpoint 명시 승인 뒤 revision/의존성/ID 재검증. 누락·의존성·액션 누락은 편집기 표시와 속성 복구 안내만 추가; 기존 프로필과 기기 합성 결과 보존. 외부 누락은 설치 파일 선택, 손상 보존 코드 재설치 차단. 자동 검사/GUI 별도.

- 08C(1.1.216): purge는 keepData로 이미 제거된 native ID만 대상. main 이중 확인 및 파일별 SHA-256 inventory revision 재검사. 검증된 retained/history manifest에서 식별 가능한 credential binding, native global vault, 보존 코드/이력만 삭제. 미확인 과거 binding·서비스 중지 선호·프로필/버튼·외부 백업은 유지. 파일별 삭제이며 부분 실패를 성공으로 표시하지 않음. 물리 완전 삭제 보장 없음. 실제 사용자 데이터 삭제 없음.

- 08D(1.1.217): 기존 로컬/Drive 선택·병합·전체 복원 및 사전 안전 백업 유지. 전체 복원 결과는 정해진 구성 필드로 투영, 외부 플러그인 코드/독립 암호화 vault 미복원. 최종 복원 확인에서 결과 프로필·템플릿 SDK 참조의 설치/누락/의존성/액션/미확인 상태 안내. 별도 플러그인 설치 신뢰 승인과 필요한 재인증은 기존 경로 사용. local DPAPI 파일 미변경 fixture 검사 추가; 실제 DPAPI/GUI 검증 별도.

- 1.1.218: 사용자 요청으로 설치 플러그인 ? 도움말 하단에 데이터 유지 제거를 통합. Stream Deck 호환 플러그인도 DeckForge 설치 폴더만 StreamDeckRemoved로 이동하고 파일별 해시 revision 확인 후 명시 승인 재설치; 원본 외부 폴더·globals·프로필·Fusion 애드인 보존. 내장 자동 설치는 보존 목록 제외. 호환 플러그인 purge 미지원. 실제 GUI 및 자동 검사 별도.

- 09A(1.1.219): 전송 계층 완전 14슬롯 Buffer SHA-256 및 wide mode 서명으로 마지막 성공 PAGE ZIP 1개(최대 8MiB) 재사용. 캐시는 압축 결과이며 실기 ACK 아님. 같은 화면도 기존 PAGE 전송 유지, reconnect/wake 전체 PAGE, 전송 실패 캐시 폐기. 진단 ZIP 크기는 USB 실제 총량이 아님. KEY(0x0d)는 기존 probe만, 제품 비활성 유지. 집중 검사 추가.

- 1.1.220: 설치/보존 목록 동일 ? 관리창. native 제거는 데이터 유지 기본 또는 제거 후 보존 데이터 삭제 선택; 먼저 제거 후 정확한 삭제 목록 승인, 취소/실패는 제거 성공과 구분. 프로필/등록 버튼 유지, legacy purge 미지원. 사용자가 수행한 설치·업데이트·롤백·제거·복구·purge의 main 결과를 diagnostics/plugin-management.jsonl(1MiB, 이전 1개) 및 AI inspect plugin_log(최근 64KiB씩, 허용 필드)로 기록/조회. raw 오류·경로·설정·토큰 미수집. 로그 기록 실패가 실제 작업 성공을 뒤집지 않음. 기존 작업 기록 소급 불가.

- 09B(1.1.221): transport 생성자 incrementalKeys=true 및 호출 liveOnly=true 두 조건 필요(생산 호출 미연결, 기본 OFF). 마지막 완료 PAGE/KEY 서명과 blank mode 및 일반 1슬롯 변경만 허용, 와이드 변경·전체 요청·sleep/reconnect는 PAGE, 16회 KEY 후 PAGE. KEY 압축/쓰기 실패 시 프로세스 내 비활성화 및 최신 전체 PAGE 복원, 세대/대기 요청 검사. mock 검증과 실기 ACK 구분. 사용자 실기 전 활성화 금지.

- 09C(1.1.222): stale PAGE 압축 실패로 최신 pending 유실하지 않도록 보호; 동일 실패 반복 금지. 절전 중 이미지 전송 보류, wake 최신 PAGE; stop 이후 지연 scan handle 즉시 종료. KEY 오류 후 disconnect/reconnect 최신 PAGE 복원 및 재시도 차단 mock 검사 추가. KEY 생산 비활성 유지. 사용자 보고: 테스트용 v1.0.0 제거 및 보존 삭제(2/2), AI 로그 조회 성공(2026-11-24 16:38:12/16 UTC); 원본 로그 직접 열람 아님.

- 1.1.223: keepData는 등록 보존, purge 성공 뒤 정확한 pluginUUID 등록 액션을 활성/비활성 프로필·페이지·덱폴더·고정키·노브/측면·복합·템플릿에서 제거(다른 액션/슬롯 유지). 미저장/실행 중 차단, 저장 실패 시 메모리 원복 및 정리 미완료 안내. 이전에 삭제된 미설치 ID는 설치/보존 부재 확인과 사용자 별도 승인 후 정리. 외부 백업 미변경; purge 로그는 파일 삭제 결과이며 프로필 정리 결과와 구분.

- 09 실기 시험(1.1.224): 명시 실행 인자 --test-key-transport에서만 transport opt-in. renderer는 기존 동일 stamp/단일 일반 키 native partial blank만 liveOnly; main frame 검증, main opt-in 이중 조건. 일반 실행/페이지/와이드 경고·재연결은 PAGE. 제목에 시험 모드 표시, USB 구조화 로그의 session/slot/slots/ZIP bytes/모드/캐시/KEY 여부 AI usb_log 제공(원시 detail 제외). ZIP bytes는 HID 총량이나 실기 ACK가 아님. 시험 미통과/미실시 시 기본 OFF 유지.

- 10A(1.1.225): Windows 기존 실제 Electron smoke에 Model 2 service/button 24쌍 반복, 개별 memory/realm/PID 유지, 6개 추가 plugin ID 순차 실행 후 idleLimit=3 LRU·close 확인 추가. 실제 측정 elapsedMs/PID/entry 수를 로그에 기록(성능 목표·장시간 soak 아님). USB mock 기본/시험 각 120회 변경, navigation, sleep/wake, reconnect, keepalive 및 최종 화면 모델 일치 검증. 실제 장치·HA·OS suspend/장시간 soak 및 04B OOM/저장 격리는 별도 통과 기준, KEY/Model 5 기본 OFF. 생산 코드 동작 미변경.

- 10A/B(1.1.226): Windows #979 반복 검사에서 PID 고정 가정 실패(8952≠3624). runner 객체 재사용과 회차별 PID 분리·realm/memory 검사는 유지하고 PID 변화 기록. 기존 Model 2 실제 Electron 입력 크기/operation 수·데이터/출력/draw 제한 거부 및 별도 서비스 생존·button 복구, opaque local/sessionStorage와 CSP data fetch 차단 시험 추가. 전체 OOM 및 Model 5 저장소 격리 판정 아님. 생산 코드 변경 없음.

- 10B(1.1.227): Windows #980 실제 로그 MODEL2_REPETITION 24쌍+6 lease, 2650ms, maxIdleEntries=3; bounded limits 5종 거부·서비스 유지·버튼 복구 성공. USB 반복 mock 기본 PAGE121/KEY0, 시험 PAGE17/KEY104, 동일 화면 검증 통과. Model5 standard IndexedDB/CacheStorage/OPFS 허용 및 opaque worker 생성 실패, eligible=false; 보안 조건 완화/생산 활성화 금지. 실제 renderer crash 시험은 Electron forcefullyCrashRenderer(https://www.electronjs.org/docs/latest/api/web-contents#contentsforcefullycrashrenderer)로 고유 PID 확인한 테스트 버튼만 종료, pending 결과 거부·서비스/peer runner 생존·새 이벤트 복구 검사. 강제 종료는 실제 OOM 아님. 생산 코드/사용자 데이터 미변경. CI #1275 성공, Windows #981 신규 검사 timeout 실패(반복·자원 제한 통과).
- 10B(1.1.228): 실행 진입 console 신호를 기다리고 전용 webContents/PID·서비스/peer 분리를 다시 검사한 후 테스트 프로세스만 SIGKILL. 실제 render-process-gone과 진행 이벤트 거부·생존·새 이벤트 복구 모두 필수; timeout만으로 통과 불가. 생산 deadline/코드 변경 없음. CI #1276 성공, Windows #982 실행 진입 PID 1168 확인 후 종료 통지 5초 timeout 실패. OS 종료 성공 반환은 통지/복구 증거 아님.
- 10B(1.1.229): Electron 공식 forcefullyCrashRenderer 복귀, 유휴와 실행 중 실제 종료를 분리. app/webContents render-process-gone 양쪽 및 destroyed/실행 거부를 구분 기록. 실제 killed/crashed 통지, 실패 이벤트 거부(timeout 불허), 동일 서비스/peer runner 생존과 새 이벤트 복구 모두 필수. 생산 deadline/코드 변경 없음. CI #1277 성공, Windows #983 유휴 crash 통지(app/webContents) 및 복구 성공. 실행 중 frame disposed 오류→destroy→통지 timeout. 실패 이벤트 재실행 아님.
- 10B(1.1.230): production createScriptRunner catch에서 정확한 disposed-frame 오류에만 최대 500ms 수명 abort 대기. lane busy 유지, 결과 폐기, 실제 종료/명시 취소로 closed가 확인된 경우만 recoverable 분류. 미통지 시 기존 원본 오류 처리. 기존 1500ms 실행/3000ms reset deadline, 즉시 외부 close, 권한·격리·실패 이벤트 재실행 금지 유지. 오류 문구 모방으로 recoverable 권한 부여 금지 검사 추가. CI #1278 성공. Windows #984 실제 idle/active crash 모두 app/webContents 통지, SDK_RUNTIME_UNAVAILABLE 거부, 서비스/peer 생존 및 새 이벤트 복구, spoof 방어, 25함수 및 실제 Windows vault 통과. 24쌍+6 lease 2012ms, idle 최대3. Model5 standard 저장소 허용/opaque 생성 실패, eligible=false. NSIS npm @electron/asar 4.3.3 tarball 404로 전체 빌드 실패; 동일 실패 job 재실행 요청 성공.

## 10C 출시 판정 (1.1.230)
- Model 2 현재 구현의 자동 장애 복구/제한/격리 검증 통과. 기존 legacy rollback 유지. 자동 검증을 장시간 실기나 OOM 증거로 확대하지 않는다.
- Model 5 생산 OFF: IndexedDB/CacheStorage/OPFS 격리 미충족 및 opaque Worker 생성 실패, 실제 OOM 미검증. KEY 생산 기본 OFF: mock 통과, 실제 D200X trial 미실시.
- Windows #984 attempt2 (job 138688628564) 전체 성공. 1.1.230 설치본 deckforge-v1.1.230 게시, 135231273 bytes. 동일 SDK 실제 장애 검사 통과, 24쌍+6 lease 2502ms, idle 최대3. Model5 eligible=false. USB mock 기본 PAGE121/KEY0, 시험 PAGE17/KEY104. 현재 root .test.cjs 45개를 test 디렉터리·실제 workflow node --test 명령·attempt2 로그에 대조하여 45/45 확인, 누락 0. 초기 native helper 3개 skip, 후속 패키지 검증 step 성공; 전체 고유 testcase 수 또는 과거 감사 44개와 동일하다는 주장 아님. SDK 저장 관련 3개 suite의 테스트 선언에서 원자 저장/receipt, ABA·복제·이동·중복 프로필, 응답 유실/재조회, child exit 및 오류 보존 검사 존재 확인. 감사 13개 원문 전수 대조 및 실제 전원 손실은 별도.
- 정식 SDK 1.0 출시 보류: 최신 실제 HA/D200X/절전·재연결/장시간 soak, 실제 OOM, 이전 감사 19개 경로/13개 저장 항목 전수 대응 미완료. 검증된 범위만 사용 가능하며 사용자 데이터/권한 및 재실행 금지 보존. 신규 범위는 별도 승인.

## 10C 감사 identity 대조 (1.1.231 후보)
대상: 사용자가 제공한 report03.md §5.2 19행(기준 1.1.177), 비교 소스 080a305fdf70519f59b4780e91781ecd75f7fc8a. 현행 승인 계약 우선. 아래는 소스 대조 및 집중 검사 현황이며 GUI/모든 런타임 경로의 통과 선언이 아니다.
| # | 감사 경로 | 현행 근거와 검증 상태 |
|---|---|---|
| 1 | 신규 버튼/노브 | editor newAction → Core.createAction; UUIDv4 기존 core 검사 |
| 2 | 잘라내기/첫 붙여넣기 | editor cutClipboardAction/pasteClipboardAction clipboardMode=cut, 성공 후 copy; GUI 별도 |
| 3 | 복사/붙여넣기 | pasteClipboardAction cloneActionInstances; helper 검사 기존, GUI 별도 |
| 4 | 드래그 이동/교환 | 일반 슬롯/컨트롤 대입 경로 일부 확인; 실제 이동/교환 GUI 및 전체 핸들러 독립 검증 보류 |
| 5 | 페이지 복제 | editPageStructure cloneActionInstances; 기존 core 검사 |
| 6 | 폴더 페이지 복제 | 동일 core 경로; 기존 core 검사 |
| 7 | 폴더 래핑 | editor cleanAction(item), ID 보존; 집중 helper 검사 추가 |
| 8 | Logic 래핑 | editor cleanAction(item), ID 보존; 집중 helper 검사 추가. sdkMountDescriptors는 표시 중 직접 SDK 액션/노브를 수집, 중첩 Logic의 실제 실행/등록 미지원 확인(1.1.239 메뉴 제한, 기존 데이터 보존; 아래 참조) |
| 9 | 고정 등록 | togglePinned cloneActionInstances; 로컬 유지 복사라는 승인 규칙, 기존 core 검사 |
| 10 | 고정키 로컬 override | setPressSlot cloneActionInstances; helper 기존, GUI 경로 별도 |
| 11 | 액션 JSON 입출력 | importSlotAction cleanAction+cloneActionInstances; GUI 별도 |
| 12 | 프로필 복제 | createProfile cloneActionInstances; 기존 core 검사 |
| 13 | 프로필 JSON 입출력 | exportSingleProfile 보존, 집중 검사 추가. 현행 프로필 메뉴는 JSON export만 제공, backup decoder는 deckforge-backup-v1 요구. 별도 개별 JSON import 미확인/신규 구현 보류; 지원 복원은 #16 |
| 14 | 템플릿 저장 | saveProfileTemplate 비활성 snapshot; 적용 시 신규 ID. 기존 core 연계 검사 |
| 15 | 템플릿 적용 | applyProfileTemplate cloneActionInstances; 기존 core 검사 |
| 16 | 백업 복원 | planRestore 전체 보존/merge·select 신규 ID; 기존 backup 검사 |
| 17 | Fusion batch | fusion-batch apply/assign createAction; 14개 명령 2페이지 신규 UUID 집중 검사 추가 |
| 18 | AI 기본 편집 | protectedType/at에서 SDK 수정·복사·이동 자체 차단; 기존 정책 유지, 차단 검사 강화. 허용한 일반 액션과 구분 |
| 19 | AI 고급 편집 | editPageStructure, fusionButton createAction, template cloneActionInstances; 복제/템플릿 ID 집중 검사 강화, profile_build 신규 ID 경로: 1.1.240 반복 명령·다중 페이지·중첩 폴더 신규 ID/보존 검사 추가, 실행 결과 대기 |
- 기존 1.1.230 Windows #984 성공과 이번 신규 검사 대기 구분. 제품 코드 변경 없음. report03 §4.2의 13개 저장 시나리오 원문 확보, 독립 대응 대조 후속. Model5/KEY OFF 유지.

## 10C 감사 저장 시나리오 대조 (1.1.232 후보)
report03.md §4.2 13행 원문 기준. 1.1.231 CI #1281/입력 #521/Windows #985 성공, identity 신규 검사 및 실제 renderer 장애 복구 통과, deckforge-v1.1.231 게시 확인. 아래 대응은 현재 제품 계약 기준이며 모든 실제 IPC/전원 손실 통과를 뜻하지 않는다.
| # | 시나리오 | 근거/검증 범위 |
|---|---|---|
| 1 | 페이지 전환 | router.sync 즉시 retire, pendingSettingsRequest 및 store requestItem; 신규 페이지 분리/retire 검사 |
| 2 | 프로필 전환 | profile-store 기존 pending save/duplicate profile 검사, mount 세대 검사; 실제 GUI 별도 |
| 3 | 삭제/덮어쓰기 | 기존 교체 ID 및 신규 삭제 fixture 검사 |
| 4 | 이동/교환 | store moved action/copy 및 slot/gesture 비교 기존 검사; 실제 GUI 별도 |
| 5 | PI 편집 충돌 | editor applyNativeSdkEffect dirty/dialog/lock 거부, router ABA revision 취소; 신규 실제 함수 VM 검사. 외부 legacy PI 병합 경로와 구분 |
| 6 | 저장 장애 | atomic rename 실패/기존 값 보존 및 receipt 없음, 읽기 불가 unknown, 기존 host 거부 검사 |
| 7 | 쓰기 후 응답 유실 | store read-only outcome 및 editor 재조회/1회 쓰기 기존 검사 |
| 8 | 쓰기 전후 timeout | expiresAt 거부 및 저장 결과 재조회 기존 검사, host unknown pause/no replay |
| 9 | ABA | configRevision 단조 증가, 최신 의도 동기 취소, 기존 core/router 검사 |
| 10 | 앱 종료 | main before-quit + router.close 즉시 취소, 신규 commit quitting 차단/VM 및 host close 검사. 실제 child exit atomic rename 검사 기존. 실제 전원 손실 아님 |
| 11 | 플러그인 장애 중 저장 | runner 장애 복구 및 atomic child exit 각각 통과; commit 진행 중 실제 renderer crash 통합 미검증 |
| 12 | global+local 효과 | validateScriptOps 한 권한 효과 제한, 기존 compound 검사; 분리 트랜잭션 미도입(승인 계약) |
| 13 | settingsResult 호환 | manifest opt-in, saved/rejected/unknown·부수효과 거부·legacy 미전달 기존 검사 |
- 1.1.232 제품 변경은 main 신규 native settings commit의 quitting guard만. 진행 중 동기 원자 저장과 읽기 전용 reconciliation 계약 유지. CI #1282/입력 #522 성공. Windows #986 실패: 신규 editor VM 테스트의 clean 요청에 필수 kind='nativeSettingsCommit' 누락, 정상 요청까지 거부됨. 신규 종료 guard, page/delete, retire/close 검사는 실제 로그 통과. 1.1.233은 테스트 fixture kind와 정상/누락 계약 검증만 추가, 제품 guard 및 저장 조건 유지. 실제 HA/D200X/전원 손실/OOM/장시간 soak 미검증.

- 1.1.233 CI #1283 및 Windows #987 전체 성공, 설치본 게시 확인. 1.1.234: 기존 Windows Electron smoke에 실제 NativePluginHost(Model2)와 임시 ProfileStore의 설정 요청 전 renderer crash(쓰기 0/자동 재실행 없음) 및 원자 저장 뒤 ACK 전 renderer crash(실제 receipt 읽기/단일 쓰기/재실행 없음/새 runner) 집중 검사 추가. 종료 통지·전용 webContents 소유 검증, test-controlled receipt 전달, 15초 시험 전용 ACK 제한. 제품 코드·기존 제한·사용자 데이터 변경 없음. 실제 main/editor IPC 동시 장애, OS 전원 손실·OOM과 구분하며 새 검사 통과 전 완료 선언 금지.

- 1.1.234 Windows #988 로그 MODEL2_SETTINGS_PROCESS_LOSS: before-request crashed, 요청/쓰기/저장 count 0/0/0; after-write crashed 1/1/1, 양쪽 noReplay=true. 실제 renderer/임시 ProfileStore, 시험 제어 ACK, 전원 손실 미검증. 1.1.236 사용자 재개 지시: 독자 v2 패키징의 외부 호환 모듈 eager import를 v1 경로에 한정. child process에서 호환 모듈 로드 차단 후 native package/parse/install/API1 입력 검사 추가. 전체 앱 Router는 외부 목록 의존성이 남아 있으며 독립 앱 실행을 검증한 것은 아니다. 기존 표시명 검사 수정, 외부 식별자·저장 키 보존. 검사 대기.

- 1.1.237: PluginRouter의 native settings ACK는 독자 호스트의 동기 검증·적용으로 처리하며 외부 catalogue/관리 직렬 큐를 기다리지 않는다. main의 영구 receipt 대조, 최신 desiredMount/revision, host active/expiry, 중복 ACK 차단 유지. 외부 catalogue를 gate로 지연한 검사 및 ABA 지연 중 stale ACK 거부 검사 추가. 목록/설치/삭제 시 충돌 검증은 유지하며 전체 catalogue 장애 독립성은 별도. 1.1.236 CI #1287 성공, Windows #991 진행 중; 신규 검사 미실행.

- 1.1.238 실행 경로 보호: catalogue 조회 실패를 빈 목록으로 간주하지 않는다(충돌·삭제 검증 유지). 새/변경 native 입력은 최신 desiredMount와 실제 native context 일치 및 revision/설정 확인 후만 허용; 확정 자기 저장의 이전 snapshot 예외 유지. 외부 호환 입력/inspector는 성공한 sync의 동일 설정 snapshot만 허용, 부분 sync 실패 시 호환 경로 차단. catalogue 실패에서 기존 동일 native 입력 유지, 변경/신규 차단, 재조회 후 복구 집중 검사 추가. 이미 접수된 이벤트의 장애 처리 및 실제 앱 독립 catalogue는 별도. 1.1.237 CI #1288 및 Windows #992 회귀 단계 성공, 패키징 중. 신규 검사 미실행.

- 1.1.239 감사 경로 #8 판정: sdkMountDescriptors는 직접 SDK 버튼/노브만 등록하고 executeMultiStep은 SDK를 명시 거부, triggerLogicSlot/renderLogicEditor는 MULTI_ALLOWED만 지원한다. 따라서 Key Logic 중첩 SDK 실행은 미지원 계약으로 구분하며 기존 중첩 데이터/instanceId는 삭제하지 않는다. context menu의 이동 허용 조건을 기존 실행 목록으로 통일하고 SDK 등 미지원 타입 차단·일반 단축키 변환·기존 중첩 데이터 보존 집중 검사 추가. 새 SDK 중첩 실행은 범위 확장 없이 보류. 1.1.238 CI #1289/Windows #993 전체 성공 및 설치본 게시, branding/native package independence/route failure/ACK isolation/ABA 관련 5개 실제 통과 로그 확인. 1.1.239 신규 검사 대기.

- 1.1.239 CI #1290·입력 #524 통과, Windows #994 신규 Key Logic 테스트에서 createAction('logic') 반환의 slots 초기화 누락으로 TypeError. 1.1.240 fixture를 실제 메뉴와 동일하게 slots 객체로 초기화. #19 AI profile_build는 makeProfileBuild → fusionButton → Core.createAction('sd-plugin')으로 각 ID 발급; 기존 프로필 유지, 반복 명령/페이지/중첩 폴더 및 별도 미리보기, 저장 재로드·프로필 전환 mount 대조 검사 추가. 생산 실행 코드 변경 없음. 신규 Windows 검사 결과 대기.

- 1.1.241 감사 #2/3/7/11: editor setItem의 일반 grid 교체가 persist 실패에도 성공처럼 진행되어 cut clipboard가 copy로 바뀌는 경로 수정. 저장 전 기존 context 확보, 실패 시 slot/selected/indicatorCommon 원복, 성공 후 이전 visual 해제 및 장치/SDK sync; 붙여넣기는 성공 반환 후만 cut→copy. 기존 dirty dialog 유지, inspectorEditing 중 clipboard 적용 차단. 실패·재시도·복사 ID 집중 검사 추가. knob/side/일반 press draft 저장 경로는 변경하지 않는다. 개별 profile JSON export 및 backup decoder를 대조했고 신규 import 기능은 추가하지 않는다. 1.1.240 CI #1291/Windows #995 회귀 단계 통과, 패키징 진행 중. 1.1.241 신규 검사 대기.

- 1.1.242: 일반 버튼 즉시 누르기 편집은 원본 local action을 복제해 수정하고, persist 실패 시 원래 slot/selected/tab/inspectorSession을 복구한다. 성공 후만 장치 sync. 전용 액션 등록 및 일반 삭제는 setItem의 성공 반환을 전달하고 Fusion 성공 표시는 실제 성공 후만 표시한다. 미저장 속성 편집·노브/측면·고정 해제 경로는 기존 유지. 집중 VM 검사 추가. 1.1.240 CI #1291/Windows #995 성공·설치본 게시. 1.1.241 CI #1292/입력 #525/Windows #996 회귀 통과·패키징 중. 신규 검사 대기.

- 2.0.2 동기화 I/O 국소 개선: PluginRouter가 동일 직렬 sync에서 확인한 호환 catalogue를 호환 host.sync에 전달하고, 단독 sync도 유효 batch 내 목록 조회를 1회로 제한한다. 13개 등록·누락 action·다음 sync 삭제·빈 batch 집중 검사 추가. 새 플러그인 실행 시 기존 별도 list/manifest 확인은 유지하며 설치/제거 충돌 검증과 장기 캐시는 변경하지 않는다. 실제 지연/메모리 절감 수치 미측정. 2.0.1 CI #1296/Windows #3 standalone 검사 성공·설치 모드 검사 중. 2.0.2 신규 검사 대기.

- 2.0.3: 호환 HA 읽기 전용 상태 보정 요청을 mount 완료 경로에서 분리. credential I/O 전 poll lock, 설정 객체/entity/context 및 suspend/credential epoch 검증, 늦은 이미지 전송 재검증. 기존 4초 요청 제한/6초 주기 유지; HA 제어 재실행 없음. 실제 플러그인 시작 및 catalogue 검증은 여전히 직렬로 유지하며 완전 독립 선언 금지. 집중 검사 대기. 2.0.1 회귀 통과·패키징 중, 2.0.2 CI #1297 및 Windows #4 standalone 통과.

- 2.0.4: 동시 반영된 동일 설정 동기화 시 설정 객체 유지 및 진행 중 HA 읽기 보존 검사 유지. 2.0.5: 검증된 catalogue와 dependency policy 이후 기존 호환 mount를 동기 해제하고 독자 mount를 먼저 확정한다. 느린/실패한 호환 프로세스 시작에 독자 입력이 대기하지 않도록 분리하고, 호환 route는 성공 시에만 확정. retire 단계 없는 host는 기존 안전 순서 유지. sync 입력은 호출자와 분리된 snapshot 사용. 집중 검사 2개 추가. catalogue 및 관리 직렬 큐 의존은 남아 있음. 신규 검사 대기.

- 2.0.6: 실제 Electron NativePluginHost/production scheduler/Model2 pool에서 페이지당 일반 13키, 4회 입력 묶음(52 press), 2회 페이지 전환 및 1회 모의 suspend/resume 호출, 서비스 메모리 유지/버튼 신규 mount 격리/종료 정리 검사 추가. 동시 반영된 2.0.5 독자 mount 선등록 및 snapshot 보호 보존. 실행 결과 대기. 실제 USB·OS 절전·장시간 soak·OOM 실측 아님.

- 2.0.39 / SDK #93 (45608509435): 실제 Windows Electron OOM reason=oom, exitCode=-536870904, 실패 입력 거부·서비스/peer 생존·새 입력 복구 성공. 로컬 전용 Crashpad 초기화/임시 dump 정리. 5분 soak 1391 press/105 페이지 전환/274 service tick, runner 2개, 실제 renderer/임시 ProfileStore 요청 전·저장 후 crash 각각 0/1회 쓰기 및 재실행 없음. 실기/OS 전원 손실 및 Model 5 OOM은 별도. Model 5 기본 OFF 유지.
- 2.0.40: NativePluginHost 서비스 정책 로딩 단일 Promise 공유, 읽기 진행 중 서비스 시작 차단, 기존 정지 설정/손상 파일 보존. 집중 회귀 검사 추가; 신규 결과 대기.

## 2.0.53 실시간 WebSocket 장애 개선 (2026-11-26)
- 기존 8개/초 고정 창 폐기: 단조 시계 token bucket 수신 burst 128/64 fps·2MiB/512KiB/s, 송신 burst 16/8 fps·32KiB/32KiB/s. 실제 용량 측정 전 초기 검증값. 미처리(실행 중 포함) 연결당 256건/2MiB, 전체 8MiB JSON 직렬화 기준; 단일 프레임 기존 제한 유지. FIFO 무음 유실 금지, 초과 시 세대 무효화/전체 재구독, 재연결 opt-in 한정. 대기 중 입력은 앞선 메시지를 먼저 FIFO에 넣고 포화 시 거부(재생 없음).
- API2 capability socketBatch: background.run+network.websocket 필요, 서비스만 최대 8건/512KiB, 큰 단건은 기존 한도. response.event='messages', bodies:string[]; 기존 단건 호환. 첫 프레임 즉시, 처리 중 후속 프레임 묶음. 배치에 한해 socketSend만 8개/합계16KiB 허용(그 외 1효과, settings/권한 불변). 실제 송신 실패 시 재연결/명령 재실행 금지. HA 0.1.13 순서 보존, 최종 publish 1회, 수치만 변경 시 목록 재사용.
- 재연결 1/2/5/10/30초±20%, 연결 30초 안정 후 시도 횟수 재충전, 인증·TLS·잘못된 프레임 재시도 금지. rate-limit/queue-capacity/송신 과부하 복구 가능 오류, 명령 재전송 없음. Scheduler admission 포화만 실행 전 재시도, 입력은 2초 초과 거부, 실제 실행 실패 재실행 금지.
- Gemini 감사의 HA 서버 coalesce_messages 협상, 구독 범위 최적화, 공유 상태/HTTP 한도 및 일반 다중 송신은 후속 계측 후 결정. 실제 Model 2 13키/500엔티티/50프레임 모의 transport 시험 추가; 실 HA/D200X 별도. 기존 자격증명 바인딩 유지.

- 2.0.54: 연결 세대 폐기 후에도 실제 FIFO 완료 전 수신 데이터의 전역 예약 바이트 유지. 스케줄러 고유 admission 오류 타입만 재시도; 실행 오류 코드 문자열 위조/충돌은 재실행 금지. 송수신 과부하 상태 구분.

- 2.0.68 HA 0.1.15: `subscribe_entities`의 `include.domains`로 지원 11개 도메인만 구독. 구버전 `invalid_format` 결과에 한해 연결마다 ID 3→4 전체 구독 1회 폴백, 이전 ID/세대 프레임 폐기, 다른 오류 및 두 번째 실패는 실패 상태. 기존 클라이언트 필터/인증 바인딩 유지. 실제 Electron 모의 소켓 재연결 검사 추가; 실제 HA 별도. 참고: https://github.com/home-assistant/core/blob/dev/homeassistant/components/websocket_api/commands.py 및 helpers/entityfilter.py.
