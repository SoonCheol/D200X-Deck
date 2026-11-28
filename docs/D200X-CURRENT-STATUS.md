# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.163 후보. 2.0.156~160 Windows #160~164 성공. 2.0.161 CI #1682/SDK #374/입력 #637/Store #102 성공, Windows #165 진행 중. 2.0.162 CI #1683/입력 #638 성공, Windows #166/SDK #375/Store #103 진행 중. 2.0.163 자동 검증 대기.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- 2.0.146~150 독자 SDK 공통 Node 실행/manifest 승인·암호화 grant, PowerShell/COM Windows 시험, 독립 창/모달/custom settings draft 및 28 API 기본 검증 통과. 2.0.151~153 외부 EXE/CodePathWin·공통 PI·팝업 크기·held dial·소유권 및 EXE 등록 시험 통과, Fusion PI 회귀는 2.0.156 Windows #160 해결. Excel/상용 원본·실기 별도.
- 2.0.154~160 Ulanzi 원본 Node/HTML 서비스·PI·폴더 설치/해시 승인·철회·편집기 라우팅/절전·설정/PNG·SVG 이미지/전역 설정 암호화·파일/폴더 선택·독립 HTML 창 기본 Windows 검증 통과. 실제 상용 원본 미검증. 2.0.161 JPEG/WebP·제한 GIF 재생 및 Chromium 시험, 2.0.162 $UA1 노브 제목/아이콘 와이드 3열 연결, 자동 Windows 결과 대기.
- 2.0.163 공개 SDK openurl(HTTP/S·query·입력 1회 또는 확인, 로컬 HTML은 기존 독립 창), toast 상태 표시, logMessage/미지원 명령의 내용 없는 세션 진단 카운트 및 권한 관리 창 표시. 기능별 fixture 시험 추가. PrivateAPI 전체 규격 미확보, hotkey·기타 실제 비공개 명령 미지원. 기존 변환 후보 제한은 유지.
- SDK API 1/2, 공개 API 28개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
## 다음 작업
- 2.0.161~163 Windows 결과 확인. 다음 hotkey 공식 keylist 계약/기존 입력 실행 연결, 실제 비공개 API는 근거 확보 후 개별 지원. 미등록 PI·원본 제거/백업 및 SDK 도구/실기. $UA1 title/icon만, GIF 정상 키/500ms/32프레임, JPEG/WebP 1024px/256KiB 및 animated WebP 미지원. 원본 전체 해시 변경 시 재승인; 상용 원본/실기 별도.
- Store 0.1.19 NAS/실기 및 편집기 2.0.145 실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
