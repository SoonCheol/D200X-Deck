# DeckForge 플러그인 규격·패키징·Ulanzi 변환 검증 계획

> 기록일: 2026-11-24 · 상태: **패키지 v1 유지 / 독자 SDK API 1·2 및 패키지 v2 / Ulanzi 변환기 미구현**
> 저장소·브랜치: `SoonCheol/D200X-Deck` / `codex/streamdeck-761-clean-editor`

## 0.2 API 2 권한 확장 (1.1.114)

- 공식 참고: [Ulanzi JS SDK 3.1.0](https://github.com/UlanziTechnology/plugin-common-node) (설정 및 held rotation), [Ulanzi D200X SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) (encoder layout), [Elgato settings](https://docs.elgato.com/streamdeck/sdk/guides/settings/), [profiles](https://docs.elgato.com/streamdeck/sdk/guides/profiles/), [OpenDeck](https://github.com/nekename/OpenDeck) (이중 SDK 지원 사례; GPL 코드 복사 없음).
- 선택 권한 `settings.write`: `api.setSettings(object)`는 현재 등록된 버튼 설정만 기존 저장 엔진으로 요청. JSON 8KiB 제한, 금지 키 검사, 기존 사용자 편집과 경합하면 거부. 반환값은 저장 성공 확인이 아니며 다음 settings 이벤트에서 확인한다. 전역/비밀 설정은 미구현. 액션 설정은 프로필에 포함되므로 인증정보를 저장하지 않는다.
- 선택 권한 `navigation`: `goToPage(index)`, `switchProfile(id|next|previous)`, `enterFolder(slot)`, `exitFolder()`. 인덱스는 0부터 시작. 기존 프로필·폴더 이동과 저장 로직 재사용.
- 선택 권한 `wide.mode`: `setWideMode(clock|datetime|stats|knobs)`는 기존 활성화된 모드만 선택. 임의 와이드 레이아웃/이미지 렌더링은 아직 미구현.
- 모든 추가 권한은 API 2에서만 허용하며 입력 이벤트당 최대 1개의 부수 효과. appear/settings/disappear에서 금지. 미저장 편집/대화상자/오래된 컨텍스트 및 설정 충돌 시 거부. 기존 SDK와 API 1 보존. 추가 권한은 설치 시 확인창으로 명시한다. 직접 파일 배치 등은 신뢰한 패키지만 사용.

## 0.1 독자 JavaScript SDK API 2 (1.1.113)

- 패키지 v2의 `runtime.apiVersion`과 native.json의 `apiVersion`을 2로 지정한다. 각 action의 `events` 대신 `script` (최대 64KiB, 동기 JavaScript 함수 본문)를 제공한다. 기존 API 1과 v1 호환 패키지는 그대로 유지한다.
- 함수 인자 `event` (`type`, `slot`, `gesture`), `settings` (읽기용 사본), `state`, `memory` (컨텍스트별 8KiB JSON 객체), `api`. `api.setTitle`, `setState`, `toggleState`, `setImage`만 허용. 예: `if(event.type==='press'){memory.n=(memory.n||0)+1;api.setTitle(String(memory.n));}`. 설치 시 문법 검사, 실제 실행은 등록된 컨텍스트에서만.
- Node/Electron API를 노출하지 않는 sandboxed Chromium 렌더러, 플러그인별 비영구 세션, CSP·요청 차단·권한 거부·탐색 차단, 1.5초 실행 제한, 입력/출력/메모리/큐 제한. 메인 프로세스는 반환 명령을 API 1 검사기로 재검증. 임의 OS 접근 권한을 허용하지 않으며 브라우저 취약점이나 모든 부채널까지 차단하는 완전한 보안 샌드박스라고 보장하지 않는다. 신뢰하는 플러그인만 설치한다.
- 예외/시간 초과/큐 초과는 해당 컨텍스트를 중단하고 렌더러를 폐기한다. 페이지 이동/절전 시 대기 명령과 오래된 결과를 폐기하며, 사라지는 이벤트는 유휴 상태에서 최선 노력으로 수행한다. 다시 등록하거나 절전 복귀 시 재시작. 자동 재시도·전체 플러그인 감시, 비동기 JS, 파일·네트워크·설정 쓰기·와이드/탐색 권한은 후속.
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
