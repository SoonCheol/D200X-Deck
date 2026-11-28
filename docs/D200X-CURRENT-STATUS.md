# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.148 후보. 최신 HEAD는 Git에서 확인. 2.0.146 Windows #150/SDK #359/CI #1667/Store #87 성공. 2.0.147 Windows #151/SDK #360/CI #1668/입력 #628/Store #88 조회 시 진행 중. 2.0.148 자동 빌드 대기.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- AGENTS/SDK 계약/로드맵/패키지 정책에 새 기준 반영. 문서 기준 변경 90639ddb 완료. 2.0.146 공통 Node 런타임 분리 및 Windows/CI 성공. 2.0.147 node.run/manifest nodeTasks/api.runNode/nodeResult, 설치 권한 안내·최초 실행 승인·거부/철회 및 manifest 해시 결합 암호화 grant, 별도 Node 실행/취소/결과. 독립 Linux Node 22 파일/모듈/하위 프로세스/취소/시간초과/한도 및 모의 vault 승인 테스트 통과(모듈 blob 일치), 통합/Windows/실기 대기.
- SDK API 1/2, 공개 API 27개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
## 다음 작업
- 1차 실행 경계·공식 SDK 기능 비교 기록 완료. 2.0.148 승인 범위 안내 명확화 및 native host→실제 Node→결과 표시·재시작 승인·철회, Windows PowerShell/Scripting.Dictionary COM 통합 검증 추가. 테스트 미실행(자동 CI 대기). 이후 Excel 실기 및 원본 패키지 의존성/지속 서비스/프로세스 트리 수명 보강 및 독립 UI 구현. Node 작업용 데이터 폴더는 자동 삭제 금지; 완전 제거 정책 별도. DECKFORGE-ROADMAP.md 최상단 순서 유지.
- Store 0.1.19 NAS/실기 및 편집기 2.0.145 실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
