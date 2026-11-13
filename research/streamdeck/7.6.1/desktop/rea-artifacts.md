# 데스크톱 REA 산출물 대조

| 로컬 산출물 | 검토 결과 |
|---|---|
| ghidra-doctor.json | REA 6.8.0, Ghidra 12.1.4, Windows x64 및 JDK 21에서 Ghidra 진단 통과. Evidence ID 없음. |
| ghidra-decompile-test.json | Windows where.exe 진입 함수 0x140001300을 디컴파일한 연결 테스트. Evidence ev_ac90e48a1564048cd3cb6eb6fc632dacd500d48a8e7a529e860965722e513cbf. |
| streamdeck-manifest-trace.json | 0바이트. 대조할 함수 또는 Evidence 없음. |

CLI 보고서의 고유 Evidence ID 32개와 위 JSON의 ID 교집합은 0개다. 데스크톱 Markdown 8개에도 해당 ID가 없다. CLI 보고서에 따르면 기존 세션의 원본 Evidence 레코드도 보존되지 않았다. 이 대조는 보존 파일을 읽어 수행했다.

데스크톱 MCP 기록에서 같은 StreamDeck.exe SHA-256을 확인했다. PE 가져오기 검사 Evidence ev_937a9af993cfc1ccddbe12607c8316e8be8f90fc34df61e2cb30be1e1dac62d4에는 QMenu::exec (IAT RVA 0xD5D758), QJsonDocument::fromJson (0xD584F0), QProcess::start (0xD597A0), QWebSocketServer::listen (0xD5C3C0)가 기록된다. 가져오기 슬롯은 호출자 주소를 제공하지 않는다. 데스크톱 초기 디컴파일은 시간 제한으로 Stream Deck 의사코드를 확보하지 못했다. 별도 CLI 보고서에는 후속 정적 분석 결과가 기록되어 있다.
