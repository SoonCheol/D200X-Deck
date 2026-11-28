# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.151 후보. 2.0.148 Windows #152/SDK #361/CI #1669/입력 #629/Store #89 성공, 실제 PowerShell/COM 통과. 2.0.149 Windows #153/CI #1670/입력 #630/Store #90 성공, SDK #362 진행 중. 2.0.150 CI #1671/입력 #631/Store #91 성공, Windows #154/SDK #363 진행 중. 2.0.151 자동 검증 대기.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- AGENTS/SDK 계약/로드맵/패키지 정책에 새 기준 반영. 문서 기준 변경 90639ddb 완료. 2.0.146 공통 Node 런타임 분리 및 Windows/CI 성공. 2.0.147 node.run/manifest nodeTasks/api.runNode/nodeResult, 설치 권한 안내·최초 실행 승인·거부/철회 및 manifest 해시 결합 암호화 grant, 별도 Node 실행/취소/결과. Windows 통합 검증 통과(2.0.148); Excel 실제 연동·D200X 실기 별도. 2.0.149 view.open/manifest views/api.openView/viewResult 및 별도 Electron 독립 창/모달, HTML/CSS/JS 입력·결과, 제출 시 승인된 설정 쓰기, context 변경/절전/종료 시 닫기 구현. 실제 Electron 테스트 추가. 2.0.150 action.settingsView 선언/편집기 기존 속성 열기 버튼/별도 모달/초안에 결과 병합, 기존 최종 저장·세션 및 충돌 확인 유지. 비활성/미등록 버튼 속성 편집 및 코드 변경/절전 취소 테스트 추가, Windows 검증 대기. 2.0.151 외부 원본 Windows CodePathWin 우선/EXE/HTM 허용, 기존 WebSocket 등록 인자·프로세스 수명 재사용, EXE 최초 실행 승인·패키지 해시 기반 암호화 권한/철회, 원본 보존. 테스트 추가, 실행 대기.
- SDK API 1/2, 공개 API 28개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
## 다음 작업
- 2.0.149/150/151 Windows 및 SDK CI 확인, 원본 EXE 실제 등록·액션 호환 및 Elgato DefaultWindowSize/공통 PropertyInspectorPath 지원 검토, 이후 Ulanzi 원본 호환. EXE 승인 해시는 로그 제외 패키지 파일 전체이므로 패키지 내부 데이터 수정 시 재승인 가능. 하위 프로세스 전체 종료·Excel 실기·외부 UI 자산/지속 통신 별도 잔여. DECKFORGE-ROADMAP.md 최상단 순서 유지.
- Store 0.1.19 NAS/실기 및 편집기 2.0.145 실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
