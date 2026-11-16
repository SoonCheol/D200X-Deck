# Fusion 360 명령 아이콘 로컬 캐시 (2026-11-16)

## 사용자 요구
- Fusion 360 연결 중 수신한 **실제 명령 아이콘**을 보존.
- 저장 파일명은 표시 이름/페이지/슬롯이 아니라 **명령 UUID(actionUUID)** 기준.
- Fusion 360을 사용할 수 없는 경우 원래 이미지가 사라지지 않도록 **캐시된 이미지 + 작은 연결 끊김 표시**를 사용.
- 정상 연결 시에는 최신 수신 아이콘이 최우선, 상태 표시 제거.
- 기존 사용자 선택 아이콘, 프로필, 명령 실행 로직에 영향 없음.
- 아이콘 파일은 개인 PC에 저장. 공개 GitHub에는 Fusion 이미지 추가 금지.

## 현재 구현
- Electron userData/fusion-command-icons/<actionUUID>.png — 이미지 파일은 공개 저장소에 포함하지 않음.
- SDK 플러그인의 setImage 이벤트를 기존 화면 렌더러에서 받아 정상 아이콘만 PNG로 저장함. 명령 ID는 **settings.pluginSettings.commandId**를 사용함(모든 Fusion 버튼의 actionUUID는 동일한 runcommand임).
- 저장 파일명은 명령 ID 자체를 사용하고 Windows 경로에 안전한 영문/숫자/마침표/밑줄/하이픈 ID만 허용. PNG 시그니처/크기 확인. 그 외 명령 ID는 아직 캐시되지 않음.
- 연결 상태 이벤트: SDK WebSocket 플러그인 등록/종료 + Fusion 공식 플러그인 비접속용 SVG(회색 비활성 이미지)를 구별하여 버튼별 오프라인 판별.
- 편집기 및 D200X 물리 버튼 렌더러에 같은 오버레이 적용.
- 상태 표시 합성은 런타임에만 하며 원본 PNG를 오염시키지 않음.

## 미검증/제약
- GitHub Actions 빌드는 별도로 확인해야 함.
- Fusion 360 프로세스가 종료되어도 플러그인 WebSocket은 살아 있을 수 있으므로 공식 플러그인의 비접속용 SVG 패턴을 사용해 감지함. 실제 버전 차이/지원 범위는 Windows 실기 확인 필요.
- 실제 플러그인의 이미지 공급 타이밍, 명령 ID, 디자인을 Windows 실기에서 확인 필요.
- 새 명령의 캐시가 비어 있으면 최초 정상 연결 시 이미지를 한번 수신해야 함.
- 사용자 선택 아이콘이 지정된 슬롯은 기존 우선순위를 보존함.

## 변경 파일
- app/streamdeck-editor/main.cjs
- app/streamdeck-editor/preload.cjs
- app/streamdeck-editor/sd-plugin-host.cjs
- app/streamdeck-editor/editor.js
- app/streamdeck-editor/device-sync.js


## 2026-11-16 연결 복구 시 X 유지 오류 수정
- 실기 사진: Fusion 360 정상 실행 상태에서 명령 이미지(돌출, 회전, 홀, 필렛, 챔퍼, 쉘)가 로드됐으나 각 버튼 오른쪽 상단에 빨간 X가 남음.
- 원인: 오프라인 계산에서 SDK WebSocket 연결 이벤트 `!connected`를 강제했고, 초기 이벤트 수신 누락 시 정상 이미지가 있어도 X를 지우지 못함.
- 수정: 명령별 정상 `setImage` 응답이 오면 해당 context를 `fusionLiveContexts`에 등록해 정상으로 처리. 비접속 SVG 또는 SDK 연결 종료 시 해제.
- 회귀 테스트: 정상 아이콘+이벤트 누락, 비접속 SVG+캐시 아이콘을 별도로 검증.
- 수정 커밋: `04c9a66f84c1f03bb443f77cef649eff64c1236c`; 테스트: `04774b98dda49efe5acb5b2f6f2604661c0b16d2`.
- Windows 실기 동작은 새 설치 파일에서 사용자 확인 필요.
