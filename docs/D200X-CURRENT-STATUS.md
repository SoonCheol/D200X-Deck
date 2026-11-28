# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.149 후보. 최신 HEAD는 Git에서 확인. 2.0.147 Windows #151/SDK #360/CI #1668/입력 #628/Store #88 성공. 2.0.148 Windows #152/SDK #361/CI #1669/입력 #629/Store #89 성공; Windows job 140882440115 로그에서 실제 PowerShell/Scripting.Dictionary COM 테스트 143 및 27개 API 통과 확인. 2.0.149 자동 검증 대기.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- AGENTS/SDK 계약/로드맵/패키지 정책에 새 기준 반영. 문서 기준 변경 90639ddb 완료. 2.0.146 공통 Node 런타임 분리 및 Windows/CI 성공. 2.0.147 node.run/manifest nodeTasks/api.runNode/nodeResult, 설치 권한 안내·최초 실행 승인·거부/철회 및 manifest 해시 결합 암호화 grant, 별도 Node 실행/취소/결과. Windows 통합 검증 통과(2.0.148); Excel 실제 연동·D200X 실기 별도. 2.0.149 view.open/manifest views/api.openView/viewResult 및 별도 Electron 독립 창/모달, HTML/CSS/JS 입력·결과, 제출 시 승인된 설정 쓰기, context 변경/절전/종료 시 닫기 구현. 실제 Electron 테스트 추가, 미실행.
- SDK API 1/2, 공개 API 28개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
## 다음 작업
- 1차 실행 경계·공식 SDK 기능 비교 기록 완료. 2.0.149 빌드/실제 Electron 창 검증 확인 후 원본 UI 자산/속성 편집기 연동 및 외부 호환 엔진 개선. Excel 실기 및 원본 패키지 의존성/지속 서비스/프로세스 트리 수명 보강은 별도 잔여. 독립 창은 현재 manifest 내 HTML 중심이며 원본 외부 UI 패키지 및 지속 양방향 통신은 후속. Node 작업용 데이터 폴더는 자동 삭제 금지; 완전 제거 정책 별도. DECKFORGE-ROADMAP.md 최상단 순서 유지.
- Store 0.1.19 NAS/실기 및 편집기 2.0.145 실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
