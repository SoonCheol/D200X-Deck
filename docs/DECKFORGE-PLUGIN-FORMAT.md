# DeckForge 플러그인 규격·패키징·Ulanzi 변환 검증 계획

> 기록일: 2026-11-24 · 상태: **전용 설치 패키지 v1 구현 / Ulanzi 코드 변환기 미구현**
> 저장소·브랜치: `SoonCheol/D200X-Deck` / `codex/streamdeck-761-clean-editor`

## 1. 기본 원칙

- **Stream Deck 호환 플러그인 직접 설치 유지:** `.sdPlugin` 폴더와 `.streamDeckPlugin`(또는 호환 ZIP) 파일은 기존 호스트로 설치한다. 파일 확장자나 SDK 프로토콜을 임의로 변경하지 않는다.
- **DeckForge 전용 설치 파일:** `.deckforgePlugin`은 자체 최상위 매니페스트를 가진 ZIP 기반 단일 파일이다. NAS·Google Drive·OneDrive에 그대로 보관 가능하며 원본은 보존한다.
- **패키지 형식과 실행 규격 분리:** DeckForge 패키지 v1의 `runtime.type=streamdeck-sdk`는 기존 SDK 호스트로 실행한다. 따라서 전용 **설치 파일 규격**이 별도로 존재하지만 **독립 실행 SDK는 아직 없다**. 미래에 새로운 런타임 타입을 추가할 때 하위 호환성을 유지한다.
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
- DeckForge 독립 네이티브 실행 SDK·공개 웹스토어: **미구현, 후속 목표**.
