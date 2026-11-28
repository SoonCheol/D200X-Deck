# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.145 유지. 최신 HEAD는 Git에서 확인. Windows/CI 2.0.145 결과 확인 필요.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- AGENTS/SDK 계약/로드맵/패키지 정책에 새 기준 반영. 제품 코드 변경 없음. 문서 변경이므로 버전 상승·수동 빌드 없음.
- SDK API 1/2, 공개 API 26개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
## 다음 작업
- SDK 전체 제한·실행/테스트 경로 추가 점검 및 공식 SDK 비교, 확장 실행 계약 설계 후 단계별 구현. DECKFORGE-ROADMAP.md 최상단 순서 유지.
- Store 0.1.19 및 편집기 2.0.145 관련 CI/NAS/실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
