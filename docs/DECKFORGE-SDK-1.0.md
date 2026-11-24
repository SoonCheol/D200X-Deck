# DeckForge 독자 SDK 1.0 — 출시 후보 계약

상태: **SDK 1.0 선언 보류 / 재설계 기준 확정**. 아래 기존 구현 계약은 유지하며 재설계 절은 구현 목표로 구분한다. 이 문서는 기존 개발 이력의 최신 독자 SDK 계약을 정리한다. SDK 제품 버전 1.0은 native.json의 apiVersion(1: 선언형, 2: JavaScript)이나 패키지 formatVersion(2)과 별개다. 외부 Stream Deck/Ulanzi 호환성은 별도 과제다.

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
- settingsSchema는 boolean/text/integer/select, 최대 16필드. 기본값은 실행 시 적용, 사용자 저장 여부 별도.
- 설치/업데이트/복원·SemVer 의존성·원자적 저장 및 버전 이력은 기존 native package 계약. 패키지 생성/설치 방법은 DECKFORGE-PLUGIN-FORMAT.md의 CLI 절 참고.

## SDK 1.1 확장 — 2026-11-24 사용자 승인

1.0의 19개 API는 기준선으로 유지한다. WebSocket 및 HTTP 확장을 최고 우선순위로 별도 진행한다. DeckForge 1.1.164: 기존 request(endpoint, body=null, query?)에 PUT/PATCH/DELETE와 endpoint.queryKeys(최대 8개, 값 문자열 최대 256자, 최종 URL 2048자)를 추가. 사용자가 승인한 HTTPS origin/path/method는 고정이며 query 값만 인코딩하여 변경한다. GET body 금지, GET 전용 polling, 기존 TLS/취소/응답 한도 유지. queryKeys 변경 시 Bearer 인증정보를 새 계약에 다시 등록해야 한다. DeckForge 1.1.166: request의 4번째 선택 인자 options={path,headers}. manifest pathKeys(1~4개)로 승인한 HTTPS base 하위 단일 경로 조각만 변경(영문/숫자/._~- 128자, dot traversal 및 slash/percent 금지); headerKeys(1~8개)로 승인한 일부 표준 및 제한 x- 헤더 값만 변경(ASCII 256자, CR/LF·인증/쿠키/프록시/프레이밍 헤더 금지). 헤더·경로 계약 변경 시 기존 Bearer vault binding 분리. WSS는 기존 queryKeys만 지원. 임의 URL/임의 헤더/비밀 직접 전달은 의도적으로 지원하지 않는다.

DeckForge 1.1.165: `network.websocket` 권한과 method `WSS`, 승인된 wss:// 주소를 사용한다. `api.connectSocket(endpoint,query?)` (appear/settings/입력), `api.sendSocket(value)` 및 `api.closeSocket()` (입력/socketEvent) 3개 추가. `event.type==='socketEvent'`, `event.response={endpoint,event:'open'|'message'|'close'|'error'|'reconnecting',body,error}`. 활성 context당 1개/플러그인당 2개/전체 8개, 송수신 각각 초당 8개, 텍스트/JSON 8KiB, 송신 대기 32KiB. TLS 검증/redirect 금지/압축 금지/5초 handshake, 1.1.167부터 endpoint.reconnect:true일 때만 transient 오류/비정상 종료/heartbeat timeout에 1/3/10초 최대 3회 재연결(활성 context 수명 전체). 송신/입력 재생 없음, 연결마다 open 이벤트에서 구독 재등록. 30초 ping/10초 pong deadline, 명시 종료/설정 변경/페이지 이탈/절전 시 재시도와 타이머 모두 취소. 페이지 이탈·설정 변경·절전·오류·종료 시 해제 및 늦은 이벤트 폐기. Bearer handshake 외 1.1.167부터 auth:'home-assistant' WSS 지원: host가 auth_required→auth(access_token)→auth_ok를 처리하고 인증 성공 후에만 open 이벤트 전달. 5초 인증 제한, auth_invalid/비정상 메시지 재시도 금지. 스크립트·일반 로그에 토큰 미전달. 공식 규격 https://developers.home-assistant.io/docs/api/websocket/ 참고. 실제 HA 서비스 연결 별도 검증. 1.1.168 실제 loopback TLS HTTPS/WSS 통합 검사 추가(테스트 전용 CA, 제품 검증 정책 변경 없음). API 1/2 manifest 번호 유지, 공개 API 확장 22개. 1.1.168 CI/Windows 및 실제 로컬 TLS 통신 성공, 실제 HA 서비스/D200X 실기 미실시.

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
- **저장:** requestId + instanceId + mountGeneration + revision 기반 충돌 검증. 저장 성공/거절/미확정 시간 초과 구분, 요청 결과 멱등성 및 영구 저장과 결과의 일관성 확보(메모리 LRU만으로 재시작 후 보장 금지). 만료 전 쓰기/쓰기 후 응답 유실/프로그램 종료·이동·복제·ABA·저장 장애 등 13개 감사 시나리오 중 현행 계약에 해당하는 항목 검증, 복합 효과 거부도 검증. 05A: mount별 configRevision(확정 설정 변경 추적)과 내부 실행 settingsRevision(외부 변경 취소용)을 분리한다. requestId/instanceId/mountGeneration/configRevision/만료/이전 값 검증, 오래된 sync 거부, 수신 불확실 시 해당 실행만 일시 중단하고 더 새로운 확정 revision 또는 remount에서 재개(자동 재실행 없음). 05B 영구 receipt 및 05C 장애 검증은 별도. settingsResult는 선택적 capability로 기존 플러그인 동작 유지. 확정되지 않은 저장·제어 자동 재시도 금지.
- **통신:** 현재 WebSocket 오류 종료 처리 보존, 큐 포화에도 연결 실패/동기화 무효화 전달 보장. 일반 SDK는 연결 세대·갭 진단·공유 상태 전달 제공; HA 구독/초기 스냅샷 재동기화·삭제 처리·카탈로그/실시간 상태 분리와 stale 표시는 HA 플러그인에 구현. 기존 getSharedState/sharedStateView 계약 호환. 제어 접수와 실제 상태 확인 구분, 토글 자동 재실행·임의 연속 입력 병합 금지. 조건부 tick(자동 회전 및 복수 센서만), 상태 이벤트가 회전 시간을 변경하지 않도록 분리.
- **범용 속성:** 기존 schema 호환층, 선언형 값 검증과 UI 메타 분리, 그룹/조건/슬라이더/색상/동적 목록. 제목 우선순위 사용자 명시(빈 제목 포함) > 템플릿 > 플러그인 동적 > 기본. 기존 제목·스타일·2상태 카드 보존, HA 코어 특례 제거. 별도 비HA 예제로 코어 수정 없이 작동 검증.
- **관리:** 제거 기본 keepData, purge 별도 명시 승인(물리적 완전 삭제 보장 금지), 의존성 검사·서비스 종료·누락 표시·재설치 복구. 기존 백업/선택/병합 유지, 외부 DPAPI vault로 유효 로컬 데이터 덮어쓰기 금지, 재인증 안내 및 신뢰 승인 전 외부 서비스 실행 금지. 인증정보 내보내기는 1.0 필수 아님.
- **USB:** 전체 14슬롯 PAGE 전송 기본 유지, 해시/PNG 캐시 개선. KEY 부분 전송은 실기에서 인접 슬롯·와이드·재연결 검증 전 기본 OFF, 오류 즉시 PAGE 복귀. USB 세션 변경 시 전체 갱신.
- **검증·롤백:** 변경 집중 검사 → 단계별 회귀 → 실행 엔진 보안/장애 주입 → 통합 soak → 실기. 미측정 숫자나 완성도 단정 금지, 기준선 측정 후 수치 목표 확정. 보안 우회·서비스 장애 전파·잘못된 설정 저장·데이터 손실·기존 기능 회귀·자원 이상 시 단계 중단 및 기능 플래그/커밋 롤백(데이터 원본 유지). USB 실기 불합격은 부분 전송 비활성화. 단계 순서·통과 조건은 [로드맵](D200X-STREAMDECK-ROADMAP.md).

### 04B Worker CSP 선행 검증 (1.1.189)

- 별도 Electron 테스트 실행 파일 `test/deckforge-worker-csp-electron.cjs`만 전용 scheme을 등록한다. 실제 앱의 Model 2/legacy 보안 정책은 변경하지 않는다. host CSP의 script-src는 none, worker의 응답 CSP는 unsafe-eval만 허용하고 worker-src/connect-src는 none. 두 scheme 후보의 AsyncFunction, 네트워크/스크립트 로딩/중첩 Worker, Node·저장소 차단, timeout·다음 실행·서비스 PID와 생존을 개별 기록한다.
- 참조: Electron protocol API (https://www.electronjs.org/docs/latest/api/protocol), MDN CSP Worker 정책 (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy). blob/data Worker는 부모 CSP를 상속하므로 단순 worker-src 완화는 채택하지 않는다. 결과가 부정적이거나 불확정이면 후보 부적격. 이 테스트가 통과해도 OOM·DrawOps·출력/메모리 상한 및 전체 API 회귀는 별도이며 Model 5 활성화 근거가 아니다.

- 1.1.190 DrawOps 후보: Worker 결과는 512 KiB JSON·16개 명령·2회 그리기·8 KiB memory 제한. 호스트에서 전체 그리기 명령을 먼저 검증하며 Worker 원시 pixels 금지. 신뢰 painter는 데이터만 받아 RGBA 생성, 치수/인코딩/총량 및 취소 재검증 후 기존 validateScriptOps 경계를 반드시 통과한다. 아직 Model 5 실행 연결 없음. 집중 Node 검사와 Electron 기존 drawKey 픽셀 동등성 검사 추가.
