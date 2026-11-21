# DeckForge 1.1.1 — Windows 절전 복귀 후 HA 제어 실패 (2026-11-18)

## 실기 관찰 (사용자)
- Windows 자동 절전 후 PC 전원 버튼으로 복귀. 트레이 DeckForge 유지.
- D200X 페이지 이동 정상. HA 물리 버튼 및 편집기 실행 테스트 모두 전등 제어 실패. ON/OFF 어느 상태에서도 동일.
- HA 웹에서 전등을 끄면 잠시 후 D200X OFF 아이콘 갱신 정상. 따라서 상태 수신과 제어 경로 구분 필요.
- DeckForge 완전 종료 후 재실행하면 HA 물리 버튼 정상 복구. 재시작 후 실행 테스트는 별도 확인하지 않음.
- 1.1.1 수정 후 자연 재발 여부/실기 절전 복귀는 사용자 확인 대기. 해결 확정 금지.

## Google AI Studio 답변 보존 (2026-11-18, 분석 기준 bcdea069526884e1654c30c2dc846a86a06c9ffc)
아래는 제공된 분석 답변의 상세 요약이며 원문 그대로의 인용은 아니다. 답변은 코드 수정·커밋·빌드 없이 분석만 수행했다고 명시했다. 추가 수정 설계 질의는 일일 한도로 응답을 받지 못했다.

1. 상태와 명령 경로 분리: sd-plugin-host.cjs start() 231행 6초 간격 refreshHaDualStates(), 387–425행. HA_PLUGIN de.perdoctus.streamdeck.homeassistant, HA_DUAL_ACTION ...dual-state-entity에 대해 메인 프로세스의 REST GET /api/states/<entity>, 4초 timeout으로 직접 조회, setState/setImage. 플러그인 WS와 무관. HA.toggle은 레거시 ha-toggle 경로(ha-client.cjs, editor.js 822–823, 3093행) 전용.
2. 명령 경로: transport.cjs 59–66 → main.cjs 319 → device-sync.js 43,69 → editor.js 3290 executeHardwareAction. 실행 테스트는 editor.js 1847,2384 → runActionPreview 2920–2927 → 같은 executeHardwareAction. SDK 분기 2994–3004 → deckBridge.sdkKey → preload.cjs 19 → main.cjs 142–145 IPC → sd-plugin-host.cjs key() 426–434 → send() 268 → 숨은 plugin.html 로컬 WS → HA 서버. 미리보기 down 뒤 100ms up. 페이지 이동은 별도 DeckCore/HID 경로.
3. 확인한 구형 코드 결함: 실제 DeckForge main.cjs에 powerMonitor 없음(레거시 app/main.js 496–498과 혼동 금지); systemDidWakeUp 미전달; HTML BrowserWindow 327–335 backgroundThrottling:false 및 render-process-gone 누락; ws.close 258–263에서 owner.ws=null, instances 잔류; ensure 291 / sync 372 존재 여부만 확인; key()는 send가 무시되어도 true 반환; editor.js 3971 pluginConnection은 Fusion만 처리.
4. 직접 원인 미확정: (A) 로컬 SDK WS 단절/렌더러 정지·크래시, (B) 로컬 WS 정상이나 plugin.html→HA 서버 outbound WS half-open, 또는 복합. 외부 HA 플러그인 v3.8.4 내부 구현은 해당 분석에서 미확인. REST 성공만으로 명령 연결 정상이라 판단 금지.
5. 제안: backgroundThrottling:false, render-process-gone 정리, 초기화/정상/좀비 인스턴스 구분, 등록 대기 제한, send 결과 확인, powerMonitor resume, 정상 SDK에 systemDidWakeUp 전달 검토, 비정상 인스턴스만 재시작. HA 내부 WS가 깨우기 이벤트로 복구되지 않으면 HA 숨은 창만 reload/재생성. 별도 REST toggle 대체 경로는 제안에 있었으나 ChatGPT 검토에서 중복 토글 위험으로 제외. Fusion Node 플러그인도 로컬 WS 단절 위험, 독립 /health 조회가 정상처럼 보일 수 있음.
6. ChatGPT가 동일 기준의 main.cjs, sd-plugin-host.cjs, editor.js, app/package.json 소스를 확인하여 분리 경로 및 주요 결함을 대조했다. 직접 장애 로그는 확보하지 못함. 이전 ChatGPT의 레거시 resume 코드 재사용 설명은 잘못된 것으로 정정함.

## 실제 반영 (제안과 구별)
- 6c6edf495d64182dec1b9cbe5def9f3c7ed8367d: style.css의 .work:has(.state-title-inspector) 조건부 grid 높이 제거.
- 3d0ee8f5e67a80a3e939b635138d71cf1236ae02: sd-plugin-host.cjs에 recoveries/starting/pressed 맵, suspended/closing/resumeTimer, send() boolean, disconnect(), recover(), onSystemSuspend()/onSystemResume(), createInstance() 분리. HTML backgroundThrottling:false, render-process-gone 정리, 현재 인스턴스/소켓 일치 확인, 이전 Node exit 무시, context 제거시 pressed 정리. key()는 단절시 복구 시작 후 false, 이벤트 재전송 없음. up은 동일 소켓에서 down 기록이 있을 때만 전송. 등록 대기 최대 5초(100ms 간격). console.info SDK recover/registered/registration-timeout/recovery-failed (토큰 없음).
- 실제 복귀 정책: 2.5초 고정 지연 후 활성 HA 인스턴스는 로컬 WS 상태에 관계없이 선별 재시작(상류 WS 건강 확인 불가 때문); 기타 활성 SDK는 로컬 readyState != 1인 경우만 복구. 정상 기타 SDK/USB/프로필/설정 유지 의도. systemDidWakeUp 전송, ping/pong, HA 상류 연결 확인, 네트워크 준비 검증, 영속 SDK 진단 로그는 이번 패치에 구현하지 않음. readyState=OPEN이 실제 전달 또는 HA 서비스 성공을 보장하지 않음.
- 6948fffb0167b49fba058e9c8d3b5234f80586f7: 실제 main.cjs powerMonitor suspend/resume 연결; app version IPC/app.getVersion(), 메뉴·제목·트레이 버전; package.json 1.1.1, NSIS 및 Actions 파일명 단일 버전 기준. editor.js 미리보기 up Promise catch. 이 커밋 워크플로 중복 삽입 오류로 #688 실패.
- 51965d4170e3332ba04100dc18afd43ffd84c456: 기존 워크플로 복원 후 버전 단계만 정상 삽입. 2026-11-18 CI #937 (44265788222) success, Windows #690 (44265788195) success를 GitHub에서 확인. 실기 미검증.

## 재발 시 조사 순서
1. 설치 버전(톱니바퀴 메뉴) 확인. 재시작 전에 페이지 이동, HA 웹 상태 변경→아이콘, 물리 버튼, 실행 테스트의 결과를 각각 기록. 절전 복귀 시각과 테스트 시각 확인.
2. SDK 로그/실제 로컬 WS 등록 상태, 숨은 창 생존, HA 서버 로그에서 명령 수신 여부 확인. 현재 SDK console 로그는 일반 GUI 환경에서 확보되지 않을 수 있으므로 필요시 민감정보 없는 파일 진단 추가. 기존 d200x-connection.log는 USB 진단이며 SDK 성공 증거 아님.
3. 재시작으로 복구되는지 기록. HA 토글 자동 재전송이나 직접 REST fallback 금지. 현재 2.5초 지연/5초 등록 제한이 네트워크 복귀에 충분한지, 복구 중 입력/페이지 전환 및 정상 Fusion 회귀 여부 확인.
4. 재현하지 못하면 해결 확정하지 않고 실기 대기 유지. 사용자 지시 전 임의 소스 변경/빌드 금지.

## 제품명 및 배포 규칙
DeckForge(프로그램), Ulanzi D200X(기기), Stream Deck SDK(호환 규격). 내부 경로는 그대로 유지. 수정 배포마다 patch 버전 증가, package.json 기준 앱/다운로드 파일명 동기화. 문서 전용 변경 또는 실패 빌드 복구 중 아직 배포하지 않은 동일 버전은 별개.
