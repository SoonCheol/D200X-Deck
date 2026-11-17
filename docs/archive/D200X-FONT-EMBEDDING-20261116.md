# DeckForge UI 글꼴 내장 변경 — 2026-11-16

## 목적과 범위
- 사용자 요청: Windows 기본 폰트 대신 깔끔한 Pretendard, 필요한 심볼 글꼴도 **앱 내부에 포함**.
- Fusion 360 아이콘 상태·캐시 코드는 이번 변경에서 수정하지 않음. 사용자가 작동을 확인했고 여기서 정리함.
- UI 기본 크기는 기존 **13px** 그대로. 화면 해상도에 따라 임의 확대/축소하지 않음.
- D200X 하드웨어 키 제목의 사용자 지정 글꼴 설정은 보존.

## 글꼴 구성
- `PretendardVariable.woff2` — 한글·영문·숫자 및 일반 본문
- `NotoSansSymbols.ttf`, `NotoSansSymbols2-Regular.ttf` — 심볼 보완
- `fonts/Pretendard-LICENSE.txt`, `fonts/Noto-Symbols-OFL.txt` — 원본 SIL Open Font License 고지

원본 바이너리는 공식 GitHub 저장소 특정 커밋의 raw URL에서 Windows 빌드 시 다운로드하며, 다운로드된 **Git blob SHA-1**을 원본 저장소의 기대값과 비교합니다. 파일이 누락되거나 검증 실패하면 빌드 중단. `app/preview-device-build/streamdeck-editor/fonts/`에 포함되어 배포판은 외부 네트워크나 Windows 폰트 설치 없이 구동됩니다. 폰트 바이너리 자체는 GitHub 소스 트리에 직접 커밋하지 않으며, 자동 패키징된 설치 파일에 내장됩니다.

## 적용 파일
- `app/streamdeck-editor/style.css` : `@font-face` 3개, 기본 UI Pretendard 13px, 심볼 전용 폰트 폴백
- `.github/workflows/streamdeck-clean-preview.yml`: 공식 글꼴 다운로드·고정 버전 SHA 검증·패키징 검증
- `app/streamdeck-editor/fonts/*-LICENSE.txt`: 라이선스 원문

## 확인
- GitHub Actions의 `DeckForge 1.0 Windows build` 성공 여부와 아티팩트의 파일 구성을 확인해야 함.
- Windows 실기의 폰트 렌더링 및 좁은 영역 글자 잘림은 설치 후 확인 필요.
- Unicode 전체 글리프를 지원하는 것은 아님. 현재 지원되는 기능 아이콘은 기존 SVG·PNG 기반을 유지.

## 2026-11-16 추가 적용 — D200X 버튼 제목 기본 글꼴

- **구현 대상:** `titleStyle.family='default'`인 버튼 제목은 편집기 미리보기와 D200X로 전송하는 PNG에서 내장 `DeckForge Pretendard`를 사용한다. 선택 목록에 명시적 Pretendard 항목도 추가.
- **기존 프로필 보호:** 저장 스키마와 `default` 값은 그대로 유지. 이전에 `Malgun Gothic` 또는 `Segoe UI`를 명시적으로 선택한 항목은 원래 글꼴을 계속 사용하며, 별도 사용자 글꼴 기능은 이번 범위에 포함하지 않음.
- **동기화 경로:** `device-sync.js`의 `drawText` → `drawSlot` → `bridge.syncPage`; 편집기 실제 PNG 미리보기도 같은 렌더러 사용. 렌더 전 `document.fonts.ready` 대기 경로 유지.
- **글꼴 범위:** 앱이 PNG로 직접 그리는 제목만 이번 변경 범위. 펌웨어 자체 시계·통계 화면은 변경 불가. Windows 실기/D200X 물리 화면 확인은 사용자 측 검증 필요.
- **빌드 결과:** GitHub Actions Windows 자동 빌드 결과는 별도로 확인.
