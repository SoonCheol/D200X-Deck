# Fusion Command Manager 도움말

## 필요한 실행 환경

- Windows에서 **Fusion Command Manager**를 실행합니다.
- **저장된 Fusion 메뉴 탐색, 명령 검색, 페이지 편집, 프로젝트 JSON 저장·불러오기**는 오프라인으로 가능합니다. 이 기능에 Fusion 360 실행이나 Codex MCP 연결은 필수가 아닙니다.
- **현재 목록 원본 아이콘 수집**과 **현재 Fusion에서 명령 ID 확인**은 같은 PC에서 **Autodesk Fusion 360** 및 **FusionStreamDeck 애드인**이 실행 중이어야 합니다. 애드인이 제공하는 로컬 주소 `127.0.0.1`로 연결하며, 애드인의 발견 파일 `%LOCALAPPDATA%\FusionStreamDeck\endpoint.json`을 사용합니다.
- **DeckForge 버튼에서 명령 실행**하려면 Fusion 360과 FusionStreamDeck 애드인, DeckForge의 원본 FusionStreamDeck 플러그인 및 해당 명령을 실행할 수 있는 작업 환경이 필요합니다. 명령 ID가 등록되어 있어도 현재 작업 영역·선택 상태에 따라 실행되지 않을 수 있습니다.
- **Codex MCP**는 Codex에서 실행 중인 Fusion의 명령을 조회하고 일괄 등록용 JSON을 생성하는 **별도 도구**입니다. 매니저의 오프라인 탐색·아이콘 수집에 Codex MCP 연결은 필요하지 않습니다. MCP를 사용하는 경우에는 Codex에 `deckforge-fusion`을 등록하고 Fusion 360/애드인을 실행해야 합니다.

## 사용 순서

1. 상단 **작업 영역 → 메뉴**에서 Fusion 메뉴를 선택합니다. 메뉴 하위 명령은 순서대로 펼쳐 보여줍니다.
2. 명령을 **DeckForge 일반 키**로 드래그하거나 **페이지 편집**으로 전환해 배치합니다.
3. 페이지 편집에서는 필요에 따라 예약 슬롯을 지정하고, 등록 대상 페이지를 선택합니다.
4. **DeckForge 등록용 JSON 내보내기**로 파일을 생성한 뒤 DeckForge의 Fusion 명령 일괄 등록 기능에서 사용합니다. 실제 명령 실행은 Fusion과 애드인 연결 상태에서 확인합니다.

## Fusion UI JSON 불러오기

Fusion 업데이트 후 메뉴·명령 배치가 바뀌어 **메뉴 정보를 다시 조사해야 할 때** 사용하는 기능입니다. 단순 검색이나 기존 메뉴 탐색에는 필요하지 않습니다.

- GitHub 저장소의 `tools/fusion-mcp/fusion-ui-inventory.py`를 Fusion 360의 **Scripts and Add-Ins**에서 실행합니다. 일반 명령 입력창에 Python 코드를 붙여 넣는 기능이 아닙니다.
- 스크립트는 메뉴 정보를 읽기만 하며 Fusion 명령을 실행하거나 디자인을 수정하지 않습니다.
- 수집 후 다운로드 폴더에 `fusion-ui-placements-날짜시간.json` 파일을 생성합니다.
- **Fusion UI JSON 불러오기**로 파일을 선택합니다. 지원하는 `format`은 `deckforge-fusion-ui-placements-v1` 및 `deckforge-fusion-ui-placements-v2`입니다.
- 읽은 UI 수집 정보는 분류·참조에 사용하며, 이미 사용자가 배치한 페이지를 자동으로 덮어쓰지 않습니다. 현재 기본 메뉴 탐색은 빌드에 포함된 메뉴 스냅샷을 기준으로 합니다.

## 현재 목록 원본 아이콘 수집

현재 탐색 화면에 표시된 명령에 대해 FusionStreamDeck 애드인에 **원본 아이콘을 요청**합니다.

1. 같은 PC에서 Fusion 360과 FusionStreamDeck 애드인을 실행합니다.
2. **현재 목록 원본 아이콘 수집**을 누릅니다.
3. 매니저가 원본 아이콘을 읽어 **매니저 전용 저장 공간**에 보관합니다. 기존 DeckForge 아이콘 캐시는 읽기만 합니다.
4. 원본 이미지가 없으면 임의 아이콘을 만들지 않습니다. 수집 과정에서 Fusion 명령 실행 요청을 보내지 않습니다.

## 연결이 안 될 때 확인할 사항

- Fusion 360이 실제로 실행 중인지 확인합니다.
- FusionStreamDeck 애드인이 실행 중인지 확인합니다.
- `%LOCALAPPDATA%\FusionStreamDeck\endpoint.json` 발견 파일이 생성됐는지 확인합니다.
- Codex 명령 조회가 필요한 경우에만 PowerShell에서 `codex mcp list`로 별도 MCP 등록 상태를 확인합니다. 단순 아이콘 수집 문제에 MCP 등록을 먼저 요구하지 않습니다.
- 데이터 수집이나 CI 성공은 실제 Fusion 명령 실행 성공을 뜻하지 않습니다.

## 개인정보·안전

Fusion 디자인·기존 DeckForge 프로필·원본 아이콘 캐시를 자동으로 변경하지 않습니다. JSON을 불러오기 전에 파일의 출처를 확인하세요.
