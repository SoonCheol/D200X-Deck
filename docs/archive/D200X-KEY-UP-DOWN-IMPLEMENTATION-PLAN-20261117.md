# DeckForge Key Up → Key Down 아이콘 구현 계획 (2026-11-17)

> 계획 확정 기록. 이 문서 커밋은 구현·빌드 완료를 뜻하지 않음.

## 배치 및 의미

1. 속성창에서 **Key Up(기본 아이콘)** 편집을 첫 번째에 표시한다.
2. **Key Down(누르는 동안)** 편집을 두 번째에 표시한다.
3. 초기에는 둘 다 기존 대표 아이콘(사용자 지정·Fusion 캐시 포함)을 그대로 사용한다. 둘이 같으면 기존 축소 애니메이션. 다르면 실제 D200X Key Down/Up에 맞추어 전환한다.
4. 속성창 대표 아이콘의 마우스 Down/Up은 화면 미리보기 전용이며 명령 실행·HA 토글·SDK 이벤트는 발생시키지 않는다.

## 범위

- Key Up/Down 공통 설정은 일반 순간형 액션 및 **모든 Fusion 360 명령**에 적용.
- HA 실제 ON/OFF, 상태형 SDK, 타이머·다중 동작 스위치·Key Logic 등은 기존 상태·입력 정책을 보존. 정확한 예외 사유는 [예외 문서](D200X-KEY-DOWN-UP-ICON-EXCEPTIONS-20261117.md) 참고.
- 페이지/폴더/프로필 전환에서 이전 슬롯의 눌림 이미지가 새 페이지에 잔류하지 않게 한다.
- 인스펙터·편집기 그리드·D200X PNG가 동일한 순간 상태를 사용하도록 하되, UI 전체 레이아웃과 사용자 아이콘·프로필은 유지한다.
- 겹침 문제로 요청된 아이콘 메뉴 펼치기(∨)는 제목을 가리지 않도록 상단에 위치시킨다.
- Fusion Manager 자석 결합·다중 모니터 동시 이동·태스크바 복원·파란색 ON 버튼 개선은 **별도 창 관리 기능**으로 분리하며, 이 아이콘 기능 커밋에 섞지 않는다.

## 변경 예정 파일

- `app/streamdeck-editor/editor.js`: Up/Down 편집 UI, 이미지 우선순위, 읽기/저장, 마우스 시각 미리보기.
- `app/streamdeck-editor/device-sync.js`: 물리 누름/뗌 시 화면 동기화, 상태형 예외, 이중 애니메이션 방지.
- `app/streamdeck-editor/style.css`: Up→Down 카드 표시 및 펼치기 버튼 위쪽 이동.
- `test/deckforge-key-press-icons.test.cjs`: 기본/눌림 이미지, Fusion/HA 예외, 기존 액션 정규화 회귀 테스트.
- `docs/D200X-CURRENT-STATUS.md`: 실제 검증 결과 기록.

## 작업·검증 절차

문서 커밋 → 최소 변경 소스·회귀 테스트 커밋 → GitHub Actions 자동 검증/Windows 설치 빌드 → 결과 기록. 물리 기기의 Key Down/Up 실제 표시 전환은 실기 검증 전까지 완료로 표시하지 않는다. 개발 브랜치 `codex/streamdeck-761-clean-editor`만 사용하며 Draft PR #5 병합 금지.
