# 02. 전체 UI 구성

## 설치 후 관찰

[메인 화면](screenshots/01-main.png)은 왼쪽 상단에 기기와 프로필 선택기, 알림·스토어·환경설정·계정 도구, 가운데 3행 5열 키, 그 아래 고정 동작·페이지 1·추가 버튼과 속성 영역을 배치한다. 오른쪽에는 검색과 키/플러그인 탭이 있다. 접근성 ID에서 ESDDeviceKeypad, ESDPropertyInspector, ESDCanvasSplitter, ActionSourceView를 확인했다.

| 환경설정 탭 | 화면에서 확인한 항목 |
|---|---|
| [일반](screenshots/03-preferences-general.png) | 버전, 업데이트, 로그인 시 실행, 경고 재설정, 도움말, 비활성 MCP Deck 옵션 |
| [기기](screenshots/preferences-device.png) | 이름, 켬, 회전 방향, 잠자기, 스크린세이버, 밝기, 펌웨어에 연결된 기기 없음 표시 |
| [계정](screenshots/preferences-account.png) | 빈 계정 목록과 추가 버튼 |
| [프로필](screenshots/preferences-profiles.png) | 기본 프로필, 응용 프로그램 연결, 기본값 지정, 추가·제거와 하단 메뉴 |
| [플러그인](screenshots/preferences-plugins.png) | 빈 목록, 추가·제거 영역, 플러그인 선택 안내 |
| [스타일](screenshots/preferences-style.png) | 다중 동작 진행상황 오버레이, 키 및 다이얼 제목 설정, 키 제목 정렬·서체·크기·색, 미리보기 |

## 초기 조사 기록과 공식 문서

## 상태
실제 앱 UI는 미확인입니다. Stream Deck 앱을 열 수 없었고, 합성 화면이나 다른 앱을 Elgato 화면 증거로 사용하지 않았습니다.

| UI 요소 | 공개 문서로 확인한 범위 | 실제 화면 |
|---|---|---|
| 액션 목록 | System Actions 도움말과 사운드 사용 가이드가 오른쪽 액션 목록에서 액션을 키로 드래그하는 흐름을 설명 | 미확인 |
| 속성 편집기 | SDK는 선택한 action의 설정을 Property Inspector에서 편집하는 구조를 설명 | 미확인 |
| 중앙 키 캔버스 | 프로필은 키에 액션을 배치하는 구성이라고 문서화 | 레이아웃·크기 미확인 |
| Preferences | General, Account, Profiles 탭 도움말. Style 탭은 6.2 릴리스 노트에서 확인 | 탭 전체 미확인 |
| Marketplace | 상단 컬러 아이콘으로 진입한다고 프로필 도움말이 설명 | 미확인 |
| 다이얼/터치스트립 | SDK의 Encoder, layout 및 touchscreen 개념 확인 | 앱 화면 미확인 |

창 크기별 변화, 검색, 아이콘/이름 편집, 프로필·폴더 관리, 플러그인 화면, Multi Action, Dial Stack 및 모든 설정 탭은 미확인입니다.
출처: https://help.elgato.com/hc/en-us/articles/360028236311-Elgato-Stream-Deck-Preferences ; https://docs.elgato.com/streamdeck/sdk/guides/ui/ ; https://docs.elgato.com/streamdeck/sdk/v1/guides/dials/

