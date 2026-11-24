# DeckForge 독자 SDK 1.0 — 출시 후보 계약

상태: **출시 후보**, 1.1.168 소프트웨어 검증 통과(실기 미실시). 이 문서는 기존 개발 이력의 최신 독자 SDK 계약을 정리한다. SDK 제품 버전 1.0은 native.json의 apiVersion(1: 선언형, 2: JavaScript)이나 패키지 formatVersion(2)과 별개다. 외부 Stream Deck/Ulanzi 호환성은 별도 과제다.

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

## 전역 서비스 (DeckForge 1.1.169~170)

API 2 manifest의 service={script,tickIntervalMs?} 및 별도 background.run 권한이 필요. 설치 승인 후 첫 host sync에서 페이지/프로필과 무관하게 서비스 1개/플러그인, 전체 최대 8개 실행. 기존 scheduler(전체 6/플러그인 2 실행), 네트워크/WS 제한 재사용. start/settings/tick/networkResult/socketEvent, slot/gesture=null, scope:'service'. stop은 유휴 renderer의 best-effort 알림(효과 무시). 서비스는 물리 버튼 출력/설정 저장/탐색 금지; 승인 WSS 및 GET polling만 자동 실행. 페이지 이동 시 서비스 연결 유지; 제거/버전 변경/의존성 차단/절전/종료 시 취소. 복귀 시 새 start, 실패 입력 재생 없음.
- publishSharedState(object): 서비스만 허용, 8KiB 검증 JSON 전체 교체. 동일 plugin의 활성 버튼에 coalesced sharedState 이벤트, 동일 값 반복 갱신 생략. getSharedState(): 해당 plugin snapshot 사본, 권한 없으면 빈 객체. 새 페이지 appear에서도 읽음. 서비스 중지/실패/절전 시 초기화. 휘발성 상태이며 인증정보 보관용 아님.
- 1.1.170: 플러그인 목록의 전역 서비스 관리에서 시작/중지/재시작. 중지는 Plugins/NativeServicePreferences.json에 원자 저장(토큰 없음), 재실행/업데이트 후 유지. 읽기 오류 시 fail closed, 원본 보존. 시작/재시작은 의존성 검사 후 수행; 실제 연결 여부 별도 표시. 명시 중지 시 서비스만 제거하고 등록 버튼/설정은 보존.
- sendServiceMessage(object): 버튼 입력 이벤트당 기존 부수 효과 한도 내 동일 플러그인 서비스에 8KiB JSON 전달. serviceMessage 이벤트 response={actionId,message}; 서비스는 승인 HTTP/WSS 효과 1개 가능, 자동 입력 재실행/타 플러그인 전달 없음. 큐 포화/서비스 중지 시 거부. 반환은 실행 성공 아님.
- 공개 함수 25개. 1.1.169 CI/입력 자동 검사 성공, 1.1.170 신규 자동 검증 및 실제 HA/D200X 실기 확인 필요.

## 출시 기준 (추가 기능은 기준이 아님)

1. 1.0 기준선 19개 및 확장 포함 현재 25개 함수 목록과 실제 Electron→host 명령 검증, 부수 효과 권한 거부 검증.
2. API 1/2 패키지 검사, 모든 예제 패키지 왕복·설치, 버전/의존성 검사.
3. 기존 집중 테스트: 큐, 취소, 설정 receipt, 암호화, 네트워크, 렌더러 오류 격리, GIF/PNG/SVG, 페이지/입력.
4. Windows CI 및 통합 빌드 성공 확인. 실제 PC/D200X 시험과 자동 검증은 구분.
5. 물리 확인 항목: 예제 설치→키/노브 입력→설정 저장/재실행, GIF 및 wide 표시, 페이지 전환/절전/재연결. 사용자 실기 없이는 물리 호환 확정 금지.

검증 상태는 최신 D200X-CURRENT-STATUS.md에 기록. 위 기준 충족 전 정식 완료 선언 금지. 이후 새 기능은 실제 플러그인 개발 요구에 따라 별도 버전으로 추가.
