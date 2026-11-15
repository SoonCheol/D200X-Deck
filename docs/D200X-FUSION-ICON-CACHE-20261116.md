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
- SDK 플러그인의 setImage 이벤트를 기존 화면 렌더러에서 받아 PNG로 저장함.
- actionUUID 접두사 com.autodesk.fusionstreamdeck. 만 허용. PNG 시그니처/크기 확인.
- 연결 상태 이벤트: SDK WebSocket 플러그인 등록 및 종료 시 발생.
- 편집기 및 D200X 물리 버튼 렌더러에 같은 오버레이 적용.
- 상태 표시 합성은 런타임에만 하며 원본 PNG를 오염시키지 않음.

## 미검증/제약
- GitHub Actions 빌드는 별도로 확인해야 함.
- Fusion 360 프로세스가 종료되어도 Stream Deck SDK 플러그인의 WebSocket이 살아 있는 경우, 현 구조는 Fusion 360 자체의 연결 끊김을 식별하지 못할 수 있음. 해당 플러그인 프로토콜의 별도 상태 신호가 필요한지 실제 연결/종료 실기 확인 필요.
- 실제 플러그인의 이미지 공급 타이밍, 명령 ID, 디자인을 Windows 실기에서 확인 필요.
- 새 명령의 캐시가 비어 있으면 최초 정상 연결 시 이미지를 한번 수신해야 함.
- 사용자 선택 아이콘이 지정된 슬롯은 기존 우선순위를 보존함.

## 변경 파일
- app/streamdeck-editor/main.cjs
- app/streamdeck-editor/preload.cjs
- app/streamdeck-editor/sd-plugin-host.cjs
- app/streamdeck-editor/editor.js
- app/streamdeck-editor/device-sync.js
