# Fusion 360 명령 일괄 등록 MCP (개인용)

## 용도

Codex에서 **이미 실행 중인 Fusion 360의 FusionStreamDeck 애드인**이 제공하는 명령 목록을 조회하고, 명령 ID를 선택해 D200X에 일괄 등록할 **새 프로필 JSON**을 만든다.

**안전한 적용:** MCP는 기존 D200X 프로필·Electron 저장소·Fusion 디자인을 변경하지 않는다. 파일 생성 이후 D200X 편집기의 **프로필 메뉴 → 전체 프로필 관리 → Fusion 360 명령 일괄 등록 JSON 가져오기**를 눌러서 사용자가 명시적으로 적용해야 한다. 가져오기 시 기존 모든 프로필을 유지하고 새로운 Fusion 프로필을 생성한다. 페이지당 **일반 버튼 13개**, 최대 128페이지(1,664개 명령). **와이드 정보 화면(14번째 슬롯)은 액션을 등록하지 않습니다.**

## 준비

1. Fusion 360에서 FusionStreamDeck 애드인 실행(시작 시 자동 실행 권장).
2. D200X 편집기에서 `Fusion 360` 플러그인이 이미 설치되어 있어야 한다.
3. Windows PC에서 Node.js 22 이상 및 Codex CLI 필요. 설치와 MCP 등록은 **사용자 PC에서 한 번** 실행한다. 별도 npm 패키지 설치는 필요 없다.

Codex CLI에서 프로젝트를 `E:\Codex\D200X-Deck` 아래에 준비한 경우 PowerShell:

```powershell
codex mcp add d200x-fusion -- node "E:\Codex\D200X-Deck\tools\fusion-mcp\server.cjs"
```

※ 실제 클론 경로가 다르면 서버 파일의 절대 경로만 변경. 이 명령은 **아직 사용자 PC에서 실행한 것이 아니다**.

## Codex에 요청하는 예

- "d200x-fusion MCP로 현재 Fusion 360의 명령을 검색해서 목록을 보여줘."
- "Extrude, SaveCommand 등의 **실제로 조회된 ID**를 이용해 Fusion 기본 명령 프로필 JSON을 만들어줘."
- "현재 로드된 Fusion 명령 전체를 새 D200X 프로필로 내보내줘."

MCP 도구: `fusion_list_commands({query,offset,limit,refresh})`, `fusion_export_batch({command_ids,profile_name})` 또는 `fusion_export_batch({all:true,profile_name})`.

생성 위치는 기본 `%USERPROFILE%\Downloads\D200X-Fusion-Commands-<timestamp>.json`. 출력 디렉터리만 변경하려면 환경변수 `D200X_FUSION_BATCH_DIR` 지정. 기존 파일 덮어쓰기를 하지 않는다.

**중요:** Fusion 애드인이 반환하는 `id`가 실제 SDK `commandId`이며 영문 검색어·표시 이름이 반드시 해당 ID인 것은 아니다. MCP가 실제 Fusion에서 받아온 ID만 내보낸다. 플러그인 원본을 수정하지 않는다.

## 한계

- 인터넷 서비스가 아니며 `%LOCALAPPDATA%\FusionStreamDeck\endpoint.json`의 `127.0.0.1` 포트로만 통신.
- 조회 목록은 **현재 Fusion 작업공간에 로드된 명령**뿐이다. 모든 워크스페이스의 명령을 자동으로 합치는 기능은 미구현.
- 현재 버전은 버튼에 각각 Run Command 액션과 설정을 자동 구성한다. 아이콘은 명령 실행 중 원본 플러그인이 Fusion에서 가져오므로 MCP가 아이콘을 별도로 저장하지 않는다.
- GitHub 자동 테스트와 사용자 PC에서의 MCP 실행은 다르므로 실제 Codex 연결·GUI 가져오기 실기 확인이 필요하다.
