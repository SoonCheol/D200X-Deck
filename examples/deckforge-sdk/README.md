# DeckForge 독자 SDK 예제

저장소 루트에서 Node와 기존 Electron 개발 의존성을 설치한 환경으로 실행한다. 실제 서버·D200X·사용자 프로필을 연결하지 않는 `simulate` 명령이다.

```powershell
node app/deckforge-editor/deckforge-sdk-cli.cjs simulate examples/deckforge-sdk/counter.native.json examples/deckforge-sdk/counter.scenario.json
node app/deckforge-editor/deckforge-sdk-cli.cjs simulate examples/deckforge-sdk/http-mock.native.json examples/deckforge-sdk/http-mock.scenario.json
node app/deckforge-editor/deckforge-sdk-cli.cjs simulate examples/deckforge-sdk/socket.native.json examples/deckforge-sdk/socket.scenario.json
```

- counter: 버튼/노브/설정/절전 모의, HTTP: 응답 4종, socket: 연결/수신/종료.
- `expectInitial`은 초기 상태, 각 step의 `expect`는 완료 후 상태, `expectErrorTotal`은 전체 진단 횟수를 검사한다. 생략한 필드는 비교하지 않는다. `assertions.failed`가 0이고 기존 실행 판정도 정상이어야 `ok:true`/종료 코드 0이다. 예상값 불일치는 `mismatches`와 종료 코드 1로 확인한다.
- 다른 manifest는 SDK 기능 설명 예제다. 타이머·인증·실제 외부 창·의존 플러그인은 현재 오프라인 도구 대상이 아니다. 실제 설치·장치·OS 연동 시험과 구분한다. 시험용 데이터만 사용한다.
- 상세 규격: [플러그인 형식](../../docs/DECKFORGE-PLUGIN-FORMAT.md), [SDK 계약](../../docs/DECKFORGE-SDK-1.0.md).
