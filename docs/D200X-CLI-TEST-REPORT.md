# D200X 버튼·노브 GitHub Actions CLI 실행 검증 — 2026-11-14

> **실제 검증 실행 완료(모의 입력 레벨).** GitHub-hosted **Windows** 실행기에서 Node.js `node:test`로 소스의 입력/실행 **계획 함수**를 직접 호출했다. 이는 단순 정적 분석이 아니지만 Electron UI, Windows 시스템 음량/확대 효과 및 물리 D200X HID 실기와는 **다르다**.

## 기준 및 재현 근거

- 저장소: `SoonCheol/D200X-Deck`, 브랜치 `codex/streamdeck-761-clean-editor`
- 테스트 대상 SHA: [`4646d22cfb5f0ebbc2cb528268a55c7c7f933669`](https://github.com/SoonCheol/D200X-Deck/commit/4646d22cfb5f0ebbc2cb528268a55c7c7f933669)
- 실제 실행: [GitHub Actions #43577138990](https://github.com/SoonCheol/D200X-Deck/actions/runs/43577138990), 워크플로 `D200X input execution verification`, Windows 실행기, Node.js 22.
- 실행 명령: `node --test --test-reporter=tap test/streamdeck-core.test.cjs test/d200x-github-actions-verification.test.cjs`
- 실행 결과: **전체 25개 / 통과 24 / 실패 1**, 워크플로 결과 **failure(예상된 결함 재현으로 인한 실패)**. 실패를 `continue-on-error`로 숨기지 않았다.
- 결과 로그는 같은 Actions 실행의 **Artifacts → `D200X-input-verification-results` → `d200x-node-test-output.txt`**로 업로드됨(실행 당시 확인됨).
- 새 코드: [`test/d200x-github-actions-verification.test.cjs`](../test/d200x-github-actions-verification.test.cjs) · 새 워크플로: [`.github/workflows/d200x-input-verification.yml`](../.github/workflows/d200x-input-verification.yml). 기존 앱 기능 소스·USB 통신·승인 UI·기존 로컬 폴더 수정 없음.

## 수행한 테스트 범위

| 검사 | 실행 결과 | 구체적 확인 |
|---|---|---|
| 물리 버튼 2개 독립 누름/뗌, 이전/다음 페이지 | **통과** | HID 형태의 모의 이벤트 인덱스 15/16에 대해 페이지 결과 및 뗌 무실행을 단언 |
| 노브 3개 좌/우 회전·누름·뗌 | **통과** | 모의 입력 인덱스 17/18/19, 제스처 구분과 액션 계획 결과 확인 |
| 노브 단계량 1·2·5·10, 방향 반전 | **통과** | 페이지 경계 및 Windows 조절용 `direction/count` 계획 결과 확인. **실제 키 입력은 미실시** |
| 다이얼 스택 계획·설정 직렬화·복원 | **통과** | 스택 전환 계획, 대상별 방향/횟수 및 저장값 roundtrip |
| 명시적 페이지별 설정 저장·복원 | **통과** | 신규 `controls.scopes='page'` 데이터 형태에서 서로 다른 페이지 할당 확인 |
| **C1 구형 페이지별 할당 이관** | **실패 · 버그 재현** | 구형 페이지 1 버튼 `next`, 페이지 2 버튼 `previous`: 2페이지에서 기대 이동 페이지 인덱스 0, 실제 인덱스 1 |
| 기본 24개 카탈로그 ID 및 미지원 실행기 구분 | **통과** | 기존 ID 24개를 확인; `hotkey/media` 실행 계획은 `unsupported`임을 검증 |
| 기존 코어 단위 테스트 | **18개 통과** | 기존 `test/streamdeck-core.test.cjs` 테스트를 추가 검증과 같은 명령으로 실행 |

**실패 로그 핵심:** `not ok 6 - REGRESSION C1: legacy DIFFERENT page-specific physical bindings must survive migration`; `AssertionError`, `expected: 0`, `actual: 1`. `# tests 25`, `# pass 24`, `# fail 1`.

## 미실시 검사 (통과로 간주하지 말 것)

- **C2:** `localStorage.setItem` 실패 시 사용자 경고. 기존 Codex 정적 분석에서 발견됐지만 이번에는 브라우저/Electron `localStorage` 오류 주입 테스트를 실행하지 않았음.
- **R1:** 빠른 연속 노브 회전으로 생성되는 별도 PowerShell 프로세스의 실제 Windows 입력 누락·순서 역전·지연 측정. 미실시.
- 실제 Electron 앱을 열어 UI/IPC 브리지 동작, 사용자 저장값 재실행 복원, 시스템 음량·앱 확대/축소의 실제 효과 측정. **미실시**.
- 실제 D200X HID 입력·USB 연결·5초 keepalive·기기 디스플레이·물리 버튼/노브 조작. **미실시**.
- P0-B 버튼/노브 공통 신형 액션 카탈로그와 P0-C 8개 핵심 기능 완성은 별도의 개발 항목이며 이번 테스트로 완료 처리하지 않음.

## 다음 조치 (현재 미실행)

1. **C1이 이제 정적 발견이 아닌 자동 실행 검증으로 재현됨.** 사용자 승인 후 구형 마이그레이션 범위만 최소 수정하고 위 테스트를 재실행하여 `25/25` 여부 확인. 기존 P0-D 페이지 전환 입력 처리 보정이 이미 존재함을 유지.
2. C2는 저장 실패 시 표시를 위한 별도 Electron/UI 검증을 계획. R1은 빠른 연속 실제 Windows 입력 측정 후 필요할 때만 수정.
3. GitHub Actions 검증은 로컬 브랜치 불일치와 무관하다. `E:\Codex` 작업 폴더 이동/새 복제·기존 브랜치 변경은 일절 수행하지 않았다.
4. 보고서 등록과 이 문서 링크 추가는 문서 전용 커밋이므로, 자동으로 실행되는 **기존 CI/Windows 프리뷰 빌드가 성공하더라도 실제 하드웨어 검증이라고 보고하지 않는다**.

관련: [기존 Codex 독립 분석](D200X-CODEX-INDEPENDENT-REVIEW-20261114.md) · [전체 인수인계](D200X-COMPLETE-HANDOFF-20261114.md) · [작업 로드맵](D200X-STREAMDECK-ROADMAP.md) · [Draft PR #5](https://github.com/SoonCheol/D200X-Deck/pull/5).
