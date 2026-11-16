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
