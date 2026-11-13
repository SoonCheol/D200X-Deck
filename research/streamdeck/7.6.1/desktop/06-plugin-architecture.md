# 06. 플러그인 아키텍처

## 설치 후 관찰

설치 폴더에서 Plugins와 PluginUI, Qt6WebEngine 및 Qt6WebSockets DLL을 관찰했다. 이 파일 목록은 SDK 통신 경로가 이 버전에서 실제로 호출됐다는 증거로 사용하지 않는다. 오른쪽 플러그인 탭 (로컬 캡처)과 환경설정 플러그인 목록 (로컬 캡처)은 모두 비어 있었다.

## 초기 조사 기록과 공식 문서

공개 Elgato SDK 문서 기준 조사입니다. 로컬 앱/플러그인 패키지를 분석한 사실로 오인하지 않도록 구분합니다.

## 확인된 SDK 구조
- Manifest JSON의 Actions 배열이 액션 메타데이터(이름, 설명, UUID, 아이콘/상태, 컨트롤러 유형, Inspector 경로)를 선언합니다.
- 앱 표시용 metadata 등록과 plugin application-layer의 실행 구현은 별도 부분입니다.
- PropertyInspectorPath로 action별 HTML/HTM UI를 지정할 수 있습니다. Plugin Environment는 Node.js 백엔드와 Chromium DOM 기반 Inspector를 설명합니다.
- Plugin은 앱이 제공한 포트와 등록 정보로 WebSocket에 연결하고 UUID 및 register event로 등록합니다. 메시지/이벤트로 설정과 액션 동작을 교환합니다.
- Controllers에는 Keypad, Encoder, Neo가 있으며 다이얼/터치 스트립용 Encoder layout, 배경, 아이콘, push/rotate/touch/long-touch 설명을 설정할 수 있습니다.
- Manifest action UUID는 사용자 프로필의 액션 인스턴스 식별에 사용되며 안정적으로 유지해야 한다는 SDK 지침이 있습니다.

공식 출처:
- https://docs.elgato.com/streamdeck/sdk/v1/guides/actions/
- https://docs.elgato.com/streamdeck/sdk/references/manifest/
- https://docs.elgato.com/streamdeck/sdk/guides/ui/
- https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/
- https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/
- https://docs.elgato.com/streamdeck/sdk/v1/guides/dials/

## 설치 위치
Manifest 및 .sdPlugin 구조는 SDK에 나타나나, 이 호스트에서 실제 설치된 플러그인 디렉터리는 관찰되지 않았습니다. Elgato 도움말의 %APPDATA%\Elgato\StreamDeck\Backup은 프로필 백업 위치이며 플러그인 경로라고 간주하지 않습니다.

## 호환성 검토에 필요한 축
1. plugin/action UUID와 manifest 필드 수용
2. action 목록 구성 및 컨트롤러별 필터링
3. 설정 Inspector/이벤트 메시지
4. plugin 프로세스 실행 및 WebSocket 등록/통신
5. Keypad와 Encoder, state, payload, coordinates 차이
6. 프로필 내 액션 식별과 미설치 plugin 처리

이 공개 인터페이스는 구현 가능성을 검토할 기초입니다. 실제 OpenDeck/Ulanzi 호환 여부는 실행 실험을 하지 않아 미확인입니다. OS 실행, 설치·업데이트, 권한, 장치 메시지 및 비공개/버전별 세부까지 동일하다고 결론 내리지 않습니다.

