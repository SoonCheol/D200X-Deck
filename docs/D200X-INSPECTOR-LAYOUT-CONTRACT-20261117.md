# DeckForge 1.1 — 속성창 레이아웃 불변 규칙 (2026-11-17)

> **강제 기준:** 기존 승인된 Stream Deck 스타일 보존. 앞으로 액션/플러그인 기능을 수정해도 아래 영역 순서·정렬·카드 크기를 임의 변경하지 않는다. 이 문서는 런타임 동작이나 실기 검증을 대체하지 않는다.

## 영역 순서 (모든 일반 키 액션 공통)
1. `.action-head`: 액션/플러그인 경로와 이름, 필요 시 도움말, 우측 **실행 테스트**.
2. `.properties`: 좌측 대표 아이콘 + 우측 **제목 표시/제목 입력** 및 액션별 **모든 설정 항목**(다중/무작위 동작 편집 포함). SDK의 `플러그인 속성 열기`는 기존 제목 행 오른쪽에 유지.
3. **아이콘 2장 전용 영역**: 설정 항목이 끝난 다음, 저장 버튼 위에 **딱 한 쌍**. 일반 순간형 및 모든 Fusion 명령은 **Key Up → Key Down**, 상태형 SDK는 **OFF → ON**. HA의 실제 상태 표시/기존 ON·OFF 실행은 보존. 표시 전용/특수 액션은 설정된 정책에 따른다.
4. `.inspector-save-bar`: 맨 아래 **취소 / 저장**. 아이콘 카드가 이 뒤에 오지 않는다.

## 규격·정렬
- 두 카드는 기존 SDK OFF/ON 스타일만 사용: 카드 **196px** × 2 + 간격 **12px** = **404px**, 이미지 **84×84px** 왼쪽, 라이브러리/파일/초기화 버튼 **76px** 3개 오른쪽 세로.
- 카드 제목은 짧게 **Key Up**, **Key Down**, 또는 **OFF**, **ON**. 별도 `키 아이콘` 라벨이나 장황한 설명 금지.
- 아이콘 행의 시작점은 제목 **입력란 시작점**과 일치해야 한다. 미리보기 왼쪽 컬럼·레이블 영역(86px)을 제외한 값 영역에 정렬.
- **줄바꿈 금지:** 충분한 너비가 없으면 카드 한 쪽을 다음 줄로 내려놓거나 크기·간격을 임의 축소하지 않는다. 필요한 경우 속성창의 해당 영역을 가로 스크롤하게 한다.
- CSS는 이 아이콘 한 쌍에 대해 공통 클래스를 사용; 유형별 중복 `padding-left`/폭 선언으로 결과가 달라지지 않게 한다.
- 모든 액션 유형에서 대표 아이콘·제목·기타 필드 크기, 입력 키 이벤트, 폰트, 저장/취소 로직 보존.

## 상태·데이터 보존
- 기존 `keyPressIcons.up/down`과 `sdkStateIcons.off/on` 및 대표 `icon`을 삭제·변경·일괄 마이그레이션하지 않는다.
- Fusion 전체 명령은 Key Up/Down만 보여주고 OFF/ON 패널을 **렌더하지 않되** 저장된 OFF/ON 값은 보존한다.
- 상태형 SDK 플러그인은 OFF/ON 패널만 표시한다. 일반 무상태 액션에는 Key Up/Down만 표시한다.
- 다중 동작 스위치 및 타이머/Key Logic 등 예외는 기존 정책 [Key Down/Up 예외 기준](D200X-KEY-DOWN-UP-ICON-EXCEPTIONS-20261117.md)을 따른다.

## 회귀 검증
- 일반 액션, 필드가 많은 액션, 다중·무작위, Fusion, 상태형 SDK 각각에서 **DOM 영역 순서**와 카드 수(0 또는 2), 너비·정렬·줄바꿈을 확인한다.
- 로컬 DOM/CSS 자동 검사 + GitHub Actions Windows 설치 빌드 검증은 **실제 PC와 D200X 실기 표시 검증과 구분하여 기록**한다.
- 다른 기능 수정 시 위 규격에 영향을 주는 변경이 있으면 이 문서와 관련 자동 테스트를 반드시 확인한다.

## 구현 위치
- `app/streamdeck-editor/editor.js`: `renderInspector()`, `bindKeyPressIconControls()`, `bindSdkStateIcons()`, `renderMultiEditor()`, `renderLogicEditor()`.
- `app/streamdeck-editor/style.css`: `.properties`, `.fields`, `.sdk-state-icons`, `.sdk-state-icon`, `.inspector-save-bar`.
- `test/deckforge-key-press-icons.test.cjs`: 아이콘 유형 정책·공통 DOM 배치 규칙 회귀 테스트.

## 공통 정렬 앵커 (코드 적용)

- 영역별 클래스: `inspector-title-region`, `inspector-properties-region`, `inspector-icon-section`, `inspector-footer-region`. 일반 키의 네 영역은 DOM 형제이며 이 순서를 유지한다.
- `--inspector-preview-width:98px`, 미리보기-속성 간격 `12px`, 라벨 너비 `78px`, 라벨-값 간격 `8px`로 제목 입력/일반 속성 값/아이콘 행의 **왼쪽 시작선 196px**을 고정한다.
- 카드 행 `404px`, 한 카드 `196px`, 간격 `12px`, `flex-wrap:nowrap`. 부족한 너비에서는 카드 행 내부 가로 스크롤을 사용하며 줄바꿈하지 않는다.
- SDK/Fusion 표시 유형은 `bindSdkStateIcons`와 `bindKeyPressIconControls` 중 하나만 렌더하도록 구분한다. 저장 값은 변경하지 않는다.
- `multi`, `random`, `logic`, `folder`의 동적 속성은 모두 `inspector-properties-region` 내에서 완성된 후 아이콘 영역을 그린다.
- **범위 한계:** 노브/물리 측면 버튼과 와이드 화면은 전용 인스펙터 구조를 그대로 유지하며, 이번 일반 키 4영역 적용의 범위가 아니다.

## 2026-11-17 — 추가 공통 필드 정렬·폴더·URL 기준
- 일반 `check()` 생성 체크박스는 **값 열 첫 위치**, 15×15px, 레이블은 공통 라벨 열에서 우측 정렬. `강제 종료`, `앞으로 가져오기`, `Enter 추가`, `자동 나가기` 일괄 검사.
- 폴더 `autoExitEnabled`, `autoExitSeconds`는 서로 다른 두 개의 표준 행. `초`는 숫자 입력 내부 오른쪽에 표시. `폴더 내부 편집` 버튼은 별도 옵션 행에 배치, 의미 없는 구분선 제거.
- 웹사이트 URL: 프로토콜 없이 입력 완료 시 기본 `http://`, HTTPS 체크 시 `https://`. 기존 접두사는 입력 우선으로 체크 상태 자동 동기화, 체크박스 변경 시 접두사 교체.
- 프로그램 `열기`와 `응용 프로그램 열기`의 인수 필드는 파일 경로와 구분되어야 하며 실행 엔진에서도 별도 전달해야 한다.

## 2026-11-17 — Windows 프로그램 파일 및 바로가기 등록
- Windows 파일 탐색기/바탕화면의 EXE/LNK/BAT/CMD를 일반 D200X 키에 드롭하면 `응용 프로그램 열기`로 등록. 기존 버튼 교체 전 확인. 드롭된 경로는 Electron `webUtils.getPathForFile`을 사용한다.
- 파일 선택 시 실행 파일 이름과 아이콘을 Electron main 프로세스에서 추출하여 빈 제목/기본 아이콘에 자동 지정. 사용자가 지정한 제목/이미지 및 별도 Key Up/Down 이미지는 보호.
- `열기`와 `응용 프로그램 열기`의 `args`는 실행 대상 파일명과 분리하여 argv로 전달. 빈 인수는 기존 실행 방식 그대로 사용.
