# DeckForge 플러그인 규격·패키징·Ulanzi 변환 검증 계획

> 기록일: 2026-11-24 · 상태: **패키지 v1 유지 / 독자 SDK API 1·2 및 패키지 v2 / Ulanzi 정적 분석·제한 후보 변환기 구현**
> 저장소·브랜치: `SoonCheol/D200X-Deck` / `codex/streamdeck-761-clean-editor`

## 0.20 독자 SDK 부분 설정 저장 (1.1.157)

- API 2 `api.patchSettings({count:5})`: 기존 저장 설정의 최상위 키를 병합한다. settings.write 권한 및 입력 이벤트 필요, 이벤트당 부수 효과 한 개. 중첩 객체는 해당 키 단위로 교체하며, 삭제 연산 없음. editor의 기존 stale write 검증 및 저장 승인 정책 적용.
- `examples/deckforge-sdk/visual-counter.native.json`은 독자 SDK로 새로 작성한 동적 그림/지속 설정 예제이며, Ulanzi 원본 변환 결과가 아니다. 저장 반영 후 settings 이벤트에서 그림을 갱신한다.

## 0.19 독자 SDK 동적 키 그림 (1.1.156)

- API 2 `api.drawKey({width:144,height:144,background:'#101010',commands:[{type:'text',x:72,y:72,text:'42',size:48,color:'#ffffff',bold:true}]})`: rect/circle/line/text, 1~144px, 32개 명령/그림, 이벤트당 2장. 색상은 #RRGGBB 또는 #RRGGBBAA, 글꼴 sans-serif/serif/monospace. 외부 이미지/폰트/URL 없음.
- sandbox RGBA 출력은 host가 재검증하고 PNG로 변환하여 기존 image operation으로 처리. 물리 출력과 원본 Ulanzi 자동 변환은 별도 검증.

## 0.18 Ulanzi 변환 PNG 무결성 강화 (1.1.131)

- 변환 후보의 PNG에 한해 256KiB/144×144 제한, 전체 chunk CRC·순서·IHDR/IEND·palette·제한된 ancillary 검사와 zlib 제한 해제/scanline 길이/필터 검사 추가. interlace/APNG/미지원 메타데이터는 수동 검토. 전체 픽셀 재구성 또는 실기 인증은 아니다.
- 기존 사용자 지정 이미지 및 기존 독자 SDK 런타임 허용 규칙은 변경하지 않는다. 손상·초과·지원하지 않는 원본은 자동 후보 임베딩에서 제외한다. 기존 header-only 분석 보고는 유지하고 integrity 결과 추가. 실제 fixture의 CRC를 교정하고 집중 손상 검사 추가.

## 0.17 독자 SDK 상태별 기본 PNG 및 제한 원본 이미지 보존 (1.1.130)

- API 1/2 action 선택 필드 `stateImages`: 상태 수와 동일한 1~2개의 PNG data URI. 기존 이미지 명령과 동일한 헤더/크기/차원 제한, 기존 SDK catalog defaultImages에 연결. 사용자 지정 이미지는 기존 우선순위 그대로 유지. 전체 PNG 디코딩/물리 출력 별도 확인.
- 제한 Ulanzi 단일 액션의 모든 States.Image가 지원 범위 PNG이면 실제 원본 바이트를 후보에 포함하고 상태별 SHA-256을 기록한다. 원본 파일과 후보 임베딩 해시를 대조. 별도 plugin/category/action artwork 또는 속성창은 여전히 수동 변환 필요. 자동 설치 없음, 기존 수동 검토 절차 유지.
- Ulanzi 변환 패키지 설치 때 원본 ID 및 검토 해시 표시, 별도 사용자 확인. 검토 기록은 인증서가 아니다. 집중 검사 추가.

## 0.16 Ulanzi 변환 검토 기록과 조건부 패키징 (1.1.129)

- review-ulanzi 명령에 전체 원본 파일 경로/크기/SHA-256 집합의 해시와 후보·검증·보고서 해시를 결합한 review 객체 추가. 원본/설정/리소스 수정 없이 분석. 로컬 검토자가 review 객체를 별도 JSON에 복사해 각 항목의 실제 증거를 기록한다.
- release-ulanzi <original.ulanziPlugin> <review-record.json> <output-directory>는 원본 전체 재분석과 후보 trace 통과, 라이선스/리소스/의미/실행/실기 항목의 명시 증거가 모두 있어야 패키징한다. 리소스·속성창이 현재 후보에 보존되지 않는 경우 증거 기록만으로 통과시키지 않는다. 설치 파일은 독자 API 1만 포함하며 v2 source.kind=ulanzi-converted, 원본 ID·원본/후보/검토 해시 기록. 후보 ID와 내용 해시 불일치 또는 출처 누락 패키지 거부. 기존 독자/호환 SDK 패키지 유지.
- 검토 기록은 신뢰한 개발자의 수동 확인 자료이며 전자서명이나 실기 성공의 독립적 증명은 아니다. 자동 설치 없음. 실제 실기 증거를 아직 확보하지 않았으므로 실제 Ulanzi 출시 패키지는 생성하지 않았다. 집중 테스트는 가상의 증거만 사용한다.

## 0.15 활성 컨텍스트 주기적 실행 (1.1.128)

- API 2 선택 권한 `timer.tick`, action `tickIntervalMs` 1000~3600000. 등록된 활성 컨텍스트만 host tick 이벤트 수신, 단일 1초 sweep, 한 sweep 최대 8개, 실행/통신 중 누락 tick은 재생하지 않는다. 페이지 이탈/교체/오류/절전/종료 시 중단; 복귀·재등록은 appear 이후 새 간격부터. `examples/deckforge-sdk/clock.native.json` 예제. 원래 JavaScript 타이머/임의 await는 미지원.
- 별도 `network.poll` 권한은 `timer.tick`과 `network.request`가 모두 필요하며 5초 이상의 tick 간격에서 승인된 GET endpoint만 허용. POST·설정·탐색·와이드 제어 및 연쇄 networkResult 요청은 주기 실행에서 금지. 기존 TLS·동시 요청·인증·취소 제한 유지. 설치 확인창에 두 권한 표시. 자동 검사 추가, 실제 네트워크·실기 별도.

## 0.14 공식 예제 회귀 및 실제 Windows 암호화 검사 (1.1.127)

- `test/fixtures/ulanzi-sdk`: 공식 Ulanzi SDK commit 550ab80c69285ecf259bd494a7fff767c14f0c0f의 API Request 및 Analog Clock 선택 원본 파일, Apache-2.0 LICENSE, 원본 경로/Git blob 해시. 원본 소스·속성창 정적 검사를 기존 테스트에 추가. 미지원 PrivateAPI, onRun, 설정 전달 이벤트, 동적 옵션·인증 헤더·checkbox 직렬화 구분을 확인한다. 이 fixture는 완전한 플러그인이 아니며 실행/설치/실기 호환을 입증하지 않는다.
- 기존 Windows 실제 Electron smoke에 네트워크 요청·결과 명령 전달 및 OS safeStorage 암호화 쓰기/재열기/복호화/낡은 revision 거부/등록 해제 테스트 추가. 임시 테스트 디렉터리만 사용, 사용자 데이터 접근 없음. Windows DPAPI는 같은 사용자 계정의 다른 프로세스까지 보호하는 경계가 아니다. 실제 CI 결과 확인 전 성공으로 간주하지 않는다.

## 0.13 독자 SDK 작성·패키징 CLI 및 Ulanzi PNG 변환 (1.1.126)

- 공식 Node SDK V3.1 `setImage(context,{isDefault:false,icons:{source:'base64',base64:'data:image/png;base64,...'}})`의 정적 literal PNG 임시 표시만 API 1 image로 변환. 기존 PNG 크기/헤더 검사 및 독립 trace 대조. 경로/GIF/SVG/default/clear/동적 값·중복 키·spread는 수동 검토. 원본 실행 금지.
- `node app/streamdeck-editor/deckforge-sdk-cli.cjs package <native.json> <output-directory>`: 독자 작성 manifest를 검증하고 v2 설치 archive 생성, 실제 설치 parser로 왕복 검증, 기존 파일 덮어쓰기 금지. 예제 `examples/deckforge-sdk/counter.native.json` 포함. 앱 설치 또는 실행은 하지 않는다.
- `node app/streamdeck-editor/deckforge-sdk-cli.cjs review-ulanzi <original.ulanziPlugin> <output-directory>`: 원본 외부에 검토 JSON 생성. Ulanzi 후보 전용 ID의 직접 CLI 패키징은 차단. 변환 후보는 라이선스·원본 자원·실제 의미·실기 검토 후 별도 출시 절차 필요. 자동 설치를 제공하지 않는다. CLI는 신뢰한 로컬 개발자를 위한 도구이지 악의적 패키지 작성 자체를 차단하는 보안 경계가 아니다.

## 0.12 Ulanzi 속성창·HTML 진입점·리소스 분석 (1.1.125)

- Ulanzi 공식 SDK 예제(API Request, Analog Clock)의 manifest/HTML/inspector.js/HTML 진입점 확인. 정적 HTML parser parse5 7.3.0(MIT), entities 6.0.1(BSD-2-Clause), npm/cli lockfile의 패키지 버전/무결성 근거 사용. HTML은 실행하지 않고 script 의존 경로를 분석한다.
- property-inspector form의 text/범위 지정 integer/정적 select를 독자 settingsSchema 제안으로 변환. 동적 옵션, 문자열 checkbox 직렬화, 비밀정보/URL/headers/body/복합 제약은 수동 검토. 원본 JS 설정 계약과 기본값 검토 전 자동 적용 금지. 제안은 실행 manifest에 자동 병합하지 않는다.
- HTML 진입점 local script 목록과 해시, manifest의 plugin/category/action/state 이미지 경로·해시 및 PNG 헤더 크기 검사. SVG/GIF/크기 조정/완전 PNG 디코딩은 수동 검토. 외부 스크립트 로딩, 원본 수정, 자동 설치 없음. 기존 제한 AST 변환과 trace 검사 보존. 집중 테스트 추가.

## 0.11 독자 SDK Bearer 인증정보 (1.1.124)

- `networkEndpoints`의 선택 필드 `auth:"bearer"`. 설치 확인창에 인증 방식 표시. 기존 플러그인 속성 버튼에서 인증정보 관리, 비밀번호 입력 필드(기존 값 미표시), 명시 암호화 저장/등록 해제. 일반 프로필 편집과 별개로 즉시 적용. Windows Electron safeStorage 비동기 API 재사용, 별도 NativeCredentials 암호화 저장소, 다른 vault와 scope 분리. SHA-256 결합 ID는 plugin ID/endpoint ID/정확한 HTTPS URL/method/auth를 포함. 변경된 주소에는 이전 토큰 재사용 금지. 정확히 동일한 등록 주소를 복원하면 기존 저장값이 남을 수 있음.
- RFC 6750 Bearer 토큰 형식 및 최대 4096자 검사, 호스트만 Authorization 헤더에 주입. 스크립트·전역 설정·프로필·일반 로그·상태 조회에 원본 토큰을 전달하지 않는다. 사용자 입력 시 인증된 편집기 IPC를 사용한다. 인증정보 없음/암호화 실패 시 요청 거부. 직접 토큰을 포함하는 응답은 차단하나 악성 서버의 변형된 응답까지 완전히 방지하지 못한다. TLS·리다이렉트 금지·요청 제한 유지. 등록 변경 중 요청 차단 및 기존 요청 취소, 이미 서버에 전달된 요청은 취소로 되돌릴 수 없음. 등록 해제는 앱의 저장 토큰 제거이지 서버 토큰 폐기가 아님. 자동 테스트 추가; 실제 Windows 암호화·서비스 연동·실기는 별도.

## 0.10 독자 SDK 비동기 HTTPS 요청 (1.1.123)

- API 2 선택 권한 `network.request`와 manifest `networkEndpoints` (최대 8개, id/url/method). 정확한 HTTPS URL(인증정보/쿼리/fragment 금지), GET 또는 JSON POST, 설치/업데이트 확인창에 주소·메서드 표시. 예: `{"id":"status","url":"https://example.com/api/status","method":"GET"}`. TLS 검증 및 리다이렉트 차단. 임의 URL/헤더/쿠키·평문 HTTP·인증정보 주입은 미지원. 지정된 호스트의 네트워크 위치는 사용자 신뢰 범위이며 모든 악성 서비스 접근을 방지한다고 보장하지 않는다.
- `api.request("status")` 또는 `api.request("postId",{value:1})`는 입력 이벤트에서만 요청을 예약한다. 호스트가 비동기로 처리하고 별도 `event.type==="networkResult"`, `event.response={endpoint,ok,status,body,error}`를 전달한다. body는 JSON/text 문자열; HTTP 실패 응답 본문은 전달하지 않는다. 결과 이벤트는 표시 명령만 허용, 연쇄 네트워크/설정/탐색 금지. 1.1.146부터 제한형 await/비동기 JS 지원. 직접 네트워크/타이머 호출 금지, host continuation 계약 유지.
- 요청 5초 제한, 본문/응답 8KiB, 컨텍스트당 하나·전체 최대 8개, 요청 중 버튼 release 처리 가능. 페이지 이탈/설정 변경/절전/종료 시 취소 및 늦은 결과 폐기. POST 서버 부수 효과는 취소로 되돌릴 수 없음. 자동 재시도 없음. 모의 전송/취소/오류 집중 테스트 추가. 인증정보 연결·로컬 실제 HTTPS 통신·실기 검증은 후속.

## 0.9 독자 SDK 선언형 속성창 (1.1.122)

- API 1/2 action의 선택 필드 `settingsSchema`: 최대 16개 필드, key/label/type/default 필수. text(maxLength 1~256), boolean, integer(min/max), select(options 최대 32개, value/label) 지원. 임의 HTML/JS/URL/비밀 입력 필드는 금지. 예: `{"key":"count","label":"횟수","type":"integer","min":0,"max":10,"default":1}`.
- 기존 '플러그인 속성 열기' 버튼과 DeckForge 공통 대화상자 재사용. 적용은 기존 inspector draft만 변경하며 저장/취소 동작 유지. 다른 세션·동시 설정 변경 거부. 값과 기본값은 공유 검증기로 검사하며 원래 설정의 다른 키 보존. 런타임은 저장되지 않은 누락 필드에 기본값을 적용하되 원본 저장 파일을 변경하지 않는다. API 2 설정 쓰기에도 값 계약 적용. 기존 필드 제거/값 계약 변경 업데이트는 마이그레이션 없이는 거부. 암호화 전역 설정 입력 UI, 기존 Ulanzi HTML 속성창 변환은 후속.

## 0.8 독자 SDK 와이드 임시 화면 (1.1.121)

- API 2 선택 권한 `wide.overlay`: `api.setWideOverlay(frame, durationMs=5000)`, `api.clearWideOverlay()`. 392×196 PNG(data URI, 256KiB 및 IHDR 크기 제한) 또는 선언형 layout(background, elements 최대 8개; text/rect/bar). 좌표·색상·문자 길이·글꼴 크기·비율 제한, HTML/CSS/외부 URL/임의 스크립트 없음. 기존 권한 확인창에 추가.
- 물리 입력 이벤트당 1개 부수 효과 제한 유지. 현재 루트 페이지의 유효한 일반 키·노브 컨텍스트만 소유 가능. 임시 표시 1~30초, 활성 소유권 충돌 거부, 다른 페이지/폴더·소유자 제거/오류·절전·USB 연결 해제·시간 만료 또는 사용자 와이드 버튼 입력 시 원래 표시 복귀. 프로필에 저장하지 않음.
- 와이드 미저장 경고가 항상 최우선. 기존 4가지 모드/순환 및 폴더 뒤로가기 유지. 편집기와 장치의 기존 PNG 합성·동기화 재사용. 집중 테스트 추가. 실제 D200X 출력은 별도 확인.

## 0.7 독자 플러그인 의존성 관리 (1.1.119)

- native.json 선택 필드 `dependencies`: 독자 플러그인 ID → SemVer 범위, 최대 32개. 기존 manifest 및 v1 Stream Deck 호환 경로 유지. 자체 의존/잘못된 범위/누락/버전 불일치/순환·전이 의존성 검사. 설치·업데이트·복원 실제 적용 직전 재검사하며 기존 정상 플러그인을 비활성화하는 변경 거부.
- 실행 시 등록된 독자 플러그인 그래프에서 활성 가능 여부 판정. 의존성이 깨진 플러그인의 새 등록 및 기존 컨텍스트 동작 차단, 기존 시각 상태 제거, 호환 SDK로 잘못 전달하지 않음. 다른 정상 플러그인은 유지. 목록에는 차단 이유 및 빈 액션 목록을 제공. 원인 해소 후 다음 SDK 동기화에서 재등록. 설치 시 필요 ID/버전 범위를 확인창에 표시.
- 이 규격은 설치 버전 의존 관계만 표현한다. 다른 플러그인의 코드/설정 공유, 자동 다운로드·설치, 네트워크 스토어, 실행 서비스 의존성 및 서명 검증은 제공하지 않는다. 기존 사용자 파일을 삭제하지 않는다. 집중 테스트 추가.

## 0.6 독자 플러그인 버전·업데이트·복원 (1.1.118)

- 기존 설치 선택창에서 동일 ID의 독자 패키지를 선택하면 버전 비교 및 사용자 확인 후 업데이트/복원한다. 기존 Stream Deck 설치 경로와 중복 설치 거부는 유지. 기존 lockfile의 ISC SemVer 7.8.5를 명시적 런타임 의존성으로 재사용. 선택 필드 `requiresDeckForge`는 유효한 SemVer 범위 및 현재 앱 버전을 검증한다.
- 이전 버전 원본 JSON을 `Plugins/NativeHistory/<id>/<canonical SHA256>.json`에 보존하고 임시 파일의 원자적 교체, 현재 파일 revision 재확인, 동일 버전 다른 내용 거부. 보존된 내용과 정확히 일치하는 이전 패키지만 복원 가능. 최대 64개 이력, 자동 삭제 없음.
- 기존 액션 ID/상태 수/지원 컨트롤러 계약의 손실을 금지한다(숨겨진 페이지 포함). 추가 액션을 제거하는 복원도 거부. 실행 중인 해당 컨텍스트를 중단·재등록하며 실패한 입력 재실행 없음. 사용자 프로필/버튼/전역 암호화 설정을 변경·복원하지 않는다. 설정 스키마 마이그레이션 및 다른 플러그인 의존성 해결/온라인 자동 업데이트는 후속.
- 기존 패키지의 비 SemVer 버전은 신규 설치·실행 가능하나 버전 비교가 필요한 업데이트/복원은 거부. 테스트와 Windows 설치 경로 검증은 별도.

## 0.5 Ulanzi 변환 후보 오프라인 검증 (1.1.117)

- 공식 Node SDK README에서 onRun(확정 단일 클릭), onKeyDown/Up, 노브 및 held 방향, setTitle/setState의 의미를 대조. onRun과 onClear 등은 여전히 자동 변환하지 않는다. onAdd와 appear의 생명주기 타이밍 차이는 검토 필요.
- 변환기의 지원 AST에서 원본 SDK 호출 trace를 따로 보존하고 독립 이벤트 매핑으로 기대 출력 생성. 실제 NativePluginHost의 키/노브 dispatch와 대조하며 원본 JS는 실행하지 않는다. 2개 context, 중복/유실 up, 회전/held/복수 tick, 설정 동기화, 제거·재등장, 절전·복귀·종료 시나리오. 변환 후보와 source trace 해시, 각 단계 pass/fail, 검증 범위/제약을 JSON 보고서에 기록.
- 의도적으로 바꾼 변환 결과를 검출하는 부정 테스트 추가. 오프라인 pass는 지원된 표시 명령의 동작 검증에 한정; 실제 Ulanzi 실행 동등성, 리소스/라이선스 및 물리 D200X 검증은 별도. 모든 후보 installationAllowed:false 유지.

## 0.4 Ulanzi 정적 분석·제한 AST 변환기 (1.1.116)

- 공식 [매니페스트](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md), [Node SDK 이벤트/명령](https://github.com/UlanziTechnology/plugin-common-node/blob/main/README.md), 공식 API Request 및 Analog Clock 예제의 manifest/진입 소스 참고. 기존 lockfile의 MIT Acorn 8.19.0을 명시적 런타임 의존성으로 사용(직접 JS 파서를 재작성하지 않음).
- `node app/streamdeck-editor/ulanzi-converter.cjs <original.ulanziPlugin>`: 원본 폴더 읽기 전용 인벤토리, 파일/크기/경로 제한, manifest/entry SHA-256, 라이선스 파일 목록 및 제한 해시, AST SDK 호출/이벤트/정적 import 분류. HTML/대형 번들/속성창/다중 액션/PrivateAPI/동적 호출/의존성 등은 수동 검토로 분류. 소스 실행·네트워크 접근·설치 없음.
- 단일 액션 및 명시적인 현재 context의 literal setTitle/setState, 명확한 onAdd/onKeyDown/onKeyUp/노브 방향 이벤트만 API 1 후보로 번역. onRun은 확인된 단일 클릭이므로 press로 임의 변환하지 않음. 원본 아이콘/설정/라이선스/실행 의미 검증이 남아 있으므로 모든 결과는 installationAllowed:false. 후보는 검증·사용자 승인 전 배포 불가. 범용 변환/HTML/번들/자동 설치는 후속.

## 0.3 암호화 전역 설정 및 제한 복구 (1.1.115)

- `global.settings` 선택 권한: `api.getGlobalSettings()`, `api.setGlobalSettings(object)`. 현재 플러그인 범위의 8KiB JSON 객체만 허용. 암호화는 [Electron safeStorage 비동기 API](https://www.electronjs.org/docs/latest/api/safe-storage) 사용. 별도 NativeSettings 폴더, ID 결합, 원자적 교체, 이전 revision 확인, 읽기 실패 시 기존 데이터 보존. 평문 대체 저장 금지. 설정은 프로필 백업에 포함하지 않는다. 같은 플러그인의 활성 컨텍스트에 settings 이벤트를 보낸다. 플러그인 스크립트는 자신의 전역 설정을 읽을 수 있으므로 신뢰한 플러그인만 설치; 비밀 전용 입력 UI 및 네트워크 요청 API는 후속.
- 렌더러 초기화 실패/종료/실행 시간 초과는 1초, 3초 간격 최대 2회 재생성. appear만 실행, 실패한 press/쓰기 재실행 금지. 코드/권한 검증 실패는 즉시 해당 컨텍스트 중단. 페이지 이동/종료/절전 시 예약 취소. 예외 상세에 인증정보가 있을 수 있어 실행 오류 상세를 편집기 로그에 전달하지 않는다.
- 현재 SDK 동작은 자동 테스트와 Windows 실제 Electron 실행 확인을 분리한다. 기존 Stream Deck 저장 파일/플러그인은 변경하지 않는다.

## 0.2 API 2 권한 확장 (1.1.114)

- 공식 참고: [Ulanzi JS SDK 3.1.0](https://github.com/UlanziTechnology/plugin-common-node) (설정 및 held rotation), [Ulanzi D200X SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) (encoder layout), [Elgato settings](https://docs.elgato.com/streamdeck/sdk/guides/settings/), [profiles](https://docs.elgato.com/streamdeck/sdk/guides/profiles/), [OpenDeck](https://github.com/nekename/OpenDeck) (이중 SDK 지원 사례; GPL 코드 복사 없음).
- 선택 권한 `settings.write`: `api.setSettings(object)`는 현재 등록된 버튼 설정만 기존 저장 엔진으로 요청. JSON 8KiB 제한, 금지 키 검사, 기존 사용자 편집과 경합하면 거부. 반환값은 저장 성공 확인이 아니며 다음 settings 이벤트에서 확인한다. 전역/비밀 설정은 미구현. 액션 설정은 프로필에 포함되므로 인증정보를 저장하지 않는다.
- 선택 권한 `navigation`: `goToPage(index)`, `switchProfile(id|next|previous)`, `enterFolder(slot)`, `exitFolder()`. 인덱스는 0부터 시작. 기존 프로필·폴더 이동과 저장 로직 재사용.
- 선택 권한 `wide.mode`: `setWideMode(clock|datetime|stats|knobs)`는 기존 활성화된 모드만 선택. 임의 와이드 레이아웃/이미지 렌더링은 아직 미구현.
- 모든 추가 권한은 API 2에서만 허용하며 입력 이벤트당 최대 1개의 부수 효과. appear/settings/disappear에서 금지. 미저장 편집/대화상자/오래된 컨텍스트 및 설정 충돌 시 거부. 기존 SDK와 API 1 보존. 추가 권한은 설치 시 확인창으로 명시한다. 직접 파일 배치 등은 신뢰한 패키지만 사용.

## 0.1 독자 JavaScript SDK API 2 (1.1.113)

- 패키지 v2의 `runtime.apiVersion`과 native.json의 `apiVersion`을 2로 지정한다. 각 action의 `events` 대신 `script` (최대 64KiB, 1.1.146부터 제한형 async JavaScript 함수 본문)를 제공한다. 기존 API 1과 v1 호환 패키지는 그대로 유지한다.
- 함수 인자 `event` (`type`, `slot`, `gesture`), `settings` (읽기용 사본), `state`, `memory` (컨텍스트별 8KiB JSON 객체), `api`. `api.setTitle`, `setState`, `toggleState`, `setImage`만 허용. 예: `if(event.type==='press'){memory.n=(memory.n||0)+1;api.setTitle(String(memory.n));}`. 설치 시 문법 검사, 실제 실행은 등록된 컨텍스트에서만.
- Node/Electron API를 노출하지 않는 sandboxed Chromium 렌더러, 플러그인별 비영구 세션, CSP·요청 차단·권한 거부·탐색 차단, 1.5초 실행 제한, 입력/출력/메모리/큐 제한. 메인 프로세스는 반환 명령을 API 1 검사기로 재검증. 임의 OS 접근 권한을 허용하지 않으며 브라우저 취약점이나 모든 부채널까지 차단하는 완전한 보안 샌드박스라고 보장하지 않는다. 신뢰하는 플러그인만 설치한다.
- 예외/시간 초과는 해당 컨텍스트를 중단하고 렌더러를 폐기한다. 큐 포화는 입력 거절로 처리(1.1.143+). 1.1.146부터 결과 수용 전 렌더러 문서를 초기화하며 host memory만 이벤트 사이 유지한다. 페이지 이동/절전 시 대기 명령과 오래된 결과를 폐기하며, 사라지는 이벤트는 유휴 상태에서 최선 노력으로 수행한다. 다시 등록하거나 절전 복귀 시 재시작. 파일 직접 접근 및 임의 네트워크는 미지원. 승인된 네트워크·설정·와이드/탐색 권한은 상단 최신 절 참조.
- Node 모의 테스트와 Windows 실제 Electron 렌더러 스모크 테스트를 추가한다. 결과 및 물리 D200X 실기는 별도 확인.

## 0. 독자 SDK API 1 (1.1.112 첫 구현)

- 기존 v1은 변경 없이 유지. v2는 `runtime.type=deckforge-sdk`, `runtime.apiVersion=1`, `source.kind=deckforge`와 `payload/native.json` 단일 프로그램을 사용한다. 기존 패키지 내보내기는 v1 전용이다.
- 프로그램은 `apiVersion:1`, `id` (`com.deckforge.native.*`), `name`, `version`, `permissions:["display"]`, `actions` 배열을 가진다. 각 action은 `id` (plugin ID + suffix), `name`, `controllers` (`Keypad`/`Encoder`), `states` (1/2), `events` 객체를 가진다. 이벤트는 appear/disappear/settings/press/release/rotateLeft/rotateRight/heldRotateLeft/heldRotateRight. 각 이벤트는 최대 16개 명령을 실행한다.
- 명령: `{"op":"title","value":"Ready"}`, `{"op":"titleFromSetting","key":"label","fallback":"Ready"}`, `{"op":"state","value":0}`, `{"op":"toggleState"}`, `{"op":"image","value":"data:image/png;base64,..."}`. 컨텍스트별 상태와 눌림을 분리한다. 기존 표시 IPC를 재사용한다.
- 임의 JS/Node/네트워크/파일/셸 실행, 전역 설정 쓰기, 와이드 화면/프로필 이동, 속성창 및 실제 프로세스 격리·자동 재시작은 **미구현**. 선언형 런타임은 외부 코드를 실행하지 않으며 권한은 display만 허용한다. 기존 호환 플러그인은 기존 신뢰 모델을 그대로 사용한다.
- 기존 호스트와 라우터로 공존하며 native 프로그램은 `Plugins/<id>.deckforge-native.json`에 별도 저장한다. 동일 ID 덮어쓰기 차단, 기존 SDK 우선. 모의 테스트와 Windows 빌드/실기는 별도 확인한다.

## 1. 기본 원칙

- **Stream Deck 호환 플러그인 직접 설치 유지:** `.sdPlugin` 폴더와 `.streamDeckPlugin`(또는 호환 ZIP) 파일은 기존 호스트로 설치한다. 파일 확장자나 SDK 프로토콜을 임의로 변경하지 않는다.
- **DeckForge 전용 설치 파일:** `.deckforgePlugin`은 자체 최상위 매니페스트를 가진 ZIP 기반 단일 파일이다. NAS·Google Drive·OneDrive에 그대로 보관 가능하며 원본은 보존한다.
- **패키지 형식과 실행 규격 분리:** DeckForge 패키지 v1의 `runtime.type=streamdeck-sdk`는 기존 SDK 호스트로 실행한다. 따라서 전용 **설치 파일 규격**이 별도로 존재하지만 **v1 자체에는 독립 실행 SDK가 없다**. 미래에 새로운 런타임 타입을 추가할 때 하위 호환성을 유지한다.
- **Ulanzi 폴더는 이름만 바꿔서 설치하지 않음:** 변환 코드·API 매핑과 실제 동작 검증에 통과한 결과에만 전용 패키지를 만든다. **현 v1 설치기는 변환되지 않은 Ulanzi 패키지를 거부한다.**
- **미지원 중 유용한 플러그인은 DeckForge 전용으로 재구현:** 지원하지 않는 API를 임의로 대체하거나 동작한다고 가장하지 않는다. 기능 단위로 사용자 가치·권한·라이선스를 확인한 뒤 별도 개발 대상으로 기록한다.

## 2. 구현된 전용 파일 형식 v1

파일명 예: `Example-plugin-1.2.3.deckforgePlugin` (ZIP 컨테이너)

```text
Example-plugin-1.2.3.deckforgePlugin
├─ deckforge-plugin.json             # DeckForge 자체 패키지 정의
└─ payload/
   ├─ manifest.json                # 현재 v1 어댑터 런타임의 SDK 정의
   ├─ plugin.html 또는 plugin.js    # 실제 SDK 실행 진입점
   └─ 아이콘·Property Inspector·리소스
```

`deckforge-plugin.json` 예시:

```json
{
  "format": "deckforge-plugin",
  "formatVersion": 1,
  "plugin": {
    "id": "com.example.plugin",
    "name": "Example plugin",
    "version": "1.0.0"
  },
  "source": {
    "kind": "streamdeck",
    "originalId": "com.example.plugin"
  },
  "runtime": {
    "type": "streamdeck-sdk",
    "directory": "payload"
  }
}
```

현재 소스: `app/streamdeck-editor/deckforge-plugin.cjs`(검증·패키징), `main.cjs`(파일 선택·설치·내보내기 IPC), `preload.cjs`, `editor.js`(패키지 저장 버튼).

플러그인 탭에서 **패키지 저장** → 기존 `.sdPlugin` 폴더 선택 → 단일 `.deckforgePlugin` 저장. NAS 공유 폴더나 클라우드 동기화 디렉터리를 저장 위치로 선택할 수 있다. 같은 이름의 기존 파일은 덮어쓰지 않으며 원본 플러그인 폴더와 별도 프로필 설정은 변경하지 않는다.

### 설치 시 검증

- 전용 포맷·버전, 플러그인 ID·이름·버전, 지원 런타임, 원본 종류 확인
- ZIP CRC, 파일 경로 정규화·심볼릭 링크·압축 해제 크기 제한, 필수 실행 파일 확인
- 내부 Stream Deck SDK 매니페스트의 ID·이름·버전이 DeckForge 최상위 매니페스트와 같은지 재확인
- 이미 동일 ID로 설치된 플러그인은 무단 덮어쓰기 금지, 기존 설정/아이콘/호환 호스트 보존
- **구조 검증 통과만으로 코드의 기능·Windows 실기 호환을 보장하지 않음**

## 3. Ulanzi 변환 파이프라인 (후속 개발 목표)

1. **원본 검사**: `.ulanziPlugin` 폴더/패키지의 `manifest.json`, 실행 진입점, 플러그인·UI 파일, 의존 라이브러리, API 호출, 운영체제, 라이선스 및 자산을 분석. 원본은 읽기 전용 보존.
2. **기능 대응표 작성**: Ulanzi 이벤트/행동 API ↔ DeckForge에서 지원하는 SDK 호스트·내장 액션을 1:1 또는 명시적인 매핑 함수로 매핑. 누락·의미 차이·권한·비동기 이벤트는 '미지원'으로 기록.
3. **코드 변환**: 단순 텍스트/확장자 치환이 아니라, API 어댑터 또는 AST 기반 변환과 호환 리소스·속성창 변환. 모호한 API는 자동 통과 금지.
4. **정적 검증**: 새 런타임 매니페스트·EntryPoint·필수 의존성·문법·Windows 경로·허용 IPC/API·보안 위험 검사. 알려진 미변환 Ulanzi API 탐지 시 실패.
5. **격리 실행 및 통신 검증**: 설치 전 검증 환경에서 플러그인 호스트 등록, `willAppear`, 키 Down/Up, 노브 회전·누름, 설정 읽기/쓰기, 이미지·제목 상태, 정상 종료/재시작을 관련 기능에 한해 시험. 외부 시스템 제어는 모의 대상으로 먼저 확인.
6. **실기 검증**: 필요한 경우 실제 D200X에서 버튼/노브·UI·Fusion·HA 연결·포커스·페이지 이동·절전/재연결을 확인. 없는 테스트를 실행했다고 기록하지 않는다.
7. **결과 분류**: `통과`→전용 설치 파일 생성 허용; `부분 지원`→미지원 기능 명시 및 별도 사용자 승인 전 패키징 금지; `미지원`→DeckForge 네이티브 구현 검토 목록으로 등록.
8. **검증 보고서 보관**: 원본 ID·버전·SHA-256, 변환기 버전, 대상 DeckForge 버전, 매핑된 API·누락 API, 검사/동작 테스트 기록, 라이선스·제작자·원본 위치, 최종 통과 여부. 웹스토어 게시 시 동일 근거 재사용.

**중요:** 위 Ulanzi 변환 파이프라인은 목표 설계이며, 현재 코드에는 자동 변환기·실기 테스트 러너가 구현되어 있지 않다. 원본의 라이선스가 재배포를 허용하지 않으면 개인 보관과 공개 웹스토어 배포를 분리해야 한다.

## 4. 미지원 플러그인 자체 개발 정책

- 지원하지 않는 플러그인을 단순히 제외하지 않고 **기능 목적과 미지원 이유를 검증 보고서에 남긴다**.
- 사용자가 유용하다고 판단한 기능만 별도 DeckForge 전용 플러그인 또는 내장 액션으로 설계한다.
- 원본 독점 코드나 배포 제한 리소스를 무단 포함하지 않고, 공식 공개 API·별도 구현으로 같은 기능 목표를 달성한다.
- 새로운 DeckForge 네이티브 SDK 도입 여부와 패키지 v2 지원은 실제 요구와 호환성 근거를 바탕으로 후속 결정한다.

## 5. 향후 NAS/클라우드·웹스토어

- 현재는 단일 파일 수동 저장을 지원하며, NAS·Google Drive·OneDrive로 **자동 업로드나 동기화는 구현하지 않았다**.
- 웹스토어에 필요한 메타데이터: 고유 ID, 버전, 호환 가능한 DeckForge 버전, 플랫폼, 파일 SHA-256, 라이선스, 원본 제작자, 변환 이력, 검증 수준, 다운로드 URL.
- 설치 후 버전 비교·서명·신뢰도·업데이트/롤백·스토어 서버/배포 권한은 별도 승인 뒤 개발한다. 설치 형식부터 네트워크 다운로드 동작과 혼합하지 않는다.

## 6. 구현/검증 구분

- `.deckforgePlugin` v1 생성·검증·설치 IPC: **코드 반영**. 자동 테스트/Windows 빌드/실기 성공은 각각 확인한 뒤 기록한다.
- `.sdPlugin` 및 `.streamDeckPlugin`: **기존 호환 경로 보존**.
- `.ulanziPlugin` 코드 자동 변환·변환 실행 검증/보고서: **미구현, 후속 목표**.
- DeckForge 독자 SDK: **선언형 API 1 첫 구현**(§0), 범용 코드 SDK·공개 웹스토어: 미구현.

## 7. 11월 말 집중 개발 순서 (2026-11-24 인수인계)

사용자 결정: 높은 난도의 기반 기술부터 최대한 완성하고 단순 UI·개별 플러그인 제작·스토어 화면은 후순위로 둔다. 아래는 개발 목표이며 구현 완료를 의미하지 않는다.

1. **독자 SDK/실행 계약:** 현재 입력·실행·상태·설정·이미지·플러그인 IPC 경계 확인 후 최소 API, 이벤트·액션 컨텍스트, 버전과 권한, 종료·복구 계약을 설계하고 구현한다. D200X 와이드 화면·노브 누르고 회전·누르기 3종·프로필/페이지/덱폴더 등은 기존 기능을 재사용하고 단계별로 노출한다.
2. **공존:** Stream Deck 호환 호스트와 전용 패키지 v1을 그대로 보존한다. 새 런타임 타입/버전은 명시적으로 분리하며 원본 패키지·프로필·아이콘·설정을 자동 변환하지 않는다. 런타임 선택 및 생명주기·컨텍스트 격리를 검증한다.
3. **Ulanzi 분석/변환:** 실제 원본과 API 근거를 확보하여 §3 파이프라인 구현. 근거 없는 매핑 및 단순 확장자 변경 금지. 지원되지 않는 API는 실패 또는 부분 지원으로 보고한다.
4. **자동 검증·오류 격리:** 정적 검사와 모의 실행, 호환 테스트, 실패 원인·결과 보고, 안전한 중단/재시작 및 필요 시 사용자 실기 검증. 신뢰되지 않은 코드의 실행 권한과 격리 한계를 명시한다. 오류가 전체 편집기나 정상 플러그인에 전파되지 않도록 설계한다.
5. **후속 고난도:** Fusion 실시간 상태 및 자동 프로필 전환, 플러그인 의존성/버전/업데이트·롤백 관리. NAS 저장소와 웹스토어 화면 등은 기반 기술 이후 개발.

**검증 원칙:** 변경 관련 집중 테스트를 작성하고, 코드/CI/Windows 빌드/사용자 실기를 구별한다. 정상 기능 보존과 데이터 손실 방지는 일정 단축을 이유로 생략하지 않는다. 사용자 명시 지시 후 구현 시작. 11월 30일까지 최대한 진행하는 목표이며 일괄 완료를 보장하지 않는다.
