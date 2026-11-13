# 01. 실행 환경 및 분석 가능 범위

## 설치 후 관찰

앱 환경설정에 7.6.1 (23033), 실행 파일 속성에 7.6.1.23033이 표시된다. 실행 경로는 C:\Program Files\Elgato\StreamDeck\StreamDeck.exe다. 앱 자체가 Qt 사용을 명시하며, 설치 폴더에서 Qt6Core.dll, Qt6Widgets.dll, Qt6WebEngineCore.dll, QtWebEngineProcess.exe, hotkeys_handler.exe, Plugins, PluginUI를 확인했다. [버전 화면](screenshots/03-preferences-general.png)

## 초기 조사 기록과 공식 문서

조사일: 2026-11-13 (Asia/Seoul)

| 항목 | 결과 |
|---|---|
| 호스트 | Windows, REA 세션이 win32/x64로 표시 |
| Elgato Stream Deck 설치/실행 | 앱 인벤토리·창 목록에 없고, 일반 후보 경로에서 실행 파일 미발견. 레지스트리 확인은 샌드박스 권한 거부 |
| 앱 버전, 설치 경로, 실행 파일 | 미확인. 앱을 확보하지 못해 확인 불가 |
| REA 연결 | 사용 가능. mcp__rea 도구가 노출되고 binary_session은 open=false를 반환 |
| REA UI 관찰 | 현재 네이티브 UI provider가 macOS 전용이라 Windows 앱 화면 캡처 불가 |
| D200X-Deck 산출물 | E:\Codex\D200X-Deck\Test\D200X-Deck-win-x64-preview\D200X-Deck.exe, 제품/파일 버전 0.16.14, 249,831,936 bytes |
| 앱 패키징 | 같은 폴더에 resources, locales, Chromium/V8 리소스와 DLL. Electron 계열 배포 형태로 관찰 |
| Git 저장소/브랜치 | 발견 경로가 Git 저장소가 아님. windows-port 및 소스 위치 미확인 |

REA 도구 목록에는 inspect_desktop_application, analyze_javascript_application, observe_native_ui, capture_native_ui_scenario 등이 있습니다. 이번 호스트의 REA native UI provider는 macOS용이며 대상 앱 파일도 없어 실행 분석은 수행하지 않았습니다. 앱을 설치하거나 내려받지 않았습니다.

레지스트리 권한이 제한되어 있어 시스템 전체 미설치를 확정하지 않습니다. 확인된 D200X-Deck은 preview 실행 파일뿐이며 Elgato 앱이나 소스 코드가 아닙니다.

