# DeckForge 현재 작업 상태
> 2026-11-28 · 최신 스냅샷, 이전 상세 상태는 Git 이력 1a4156aec17bcc57c50a26c8f3ab827545cc4523 참조.
## 환경
- SoonCheol/D200X-Deck · codex/streamdeck-761-clean-editor · E:\Codex\DeckForge · Draft PR #5 유지.
- 소스 2.0.180 후보. 2.0.156~160 Windows #160~164 성공. 2.0.161~163 Windows #165~167/CI #1682~1684/SDK #374~376/입력 #637~639/Store #102~104 모두 성공. 2.0.164 Windows #168/입력 #640/SDK #378/CI #1686/Store #106 성공.
## 현재 기준
- 사용자 승인: 개인용 SDK의 기능 확장성·외부 호환성·개발 편의성 우선. 기존 안정성·데이터·기능 보존. 전체 재개발 금지. 원본 실행 우선, PrivateAPI 기능별 판단.
- 2.0.146~150 독자 SDK 공통 Node 실행/manifest 승인·암호화 grant, PowerShell/COM Windows 시험, 독립 창/모달/custom settings draft 및 28 API 기본 검증 통과. 2.0.151~153 외부 EXE/CodePathWin·공통 PI·팝업 크기·held dial·소유권 및 EXE 등록 시험 통과, Fusion PI 회귀는 2.0.156 Windows #160 해결. Excel/상용 원본·실기 별도.
- 2.0.154~160 Ulanzi 원본 Node/HTML 서비스·PI·폴더 설치/해시 승인·철회·편집기 라우팅/절전·설정/PNG·SVG 이미지/전역 설정 암호화·파일/폴더 선택·독립 HTML 창 기본 Windows 검증 통과. 실제 상용 원본 미검증. 2.0.161 JPEG/WebP·제한 GIF 재생 및 Chromium 시험, 2.0.162 $UA1 노브 제목/아이콘 와이드 3열 연결, Windows #165~166 성공.
- 2.0.163 공개 SDK openurl(HTTP/S·query·입력 1회 또는 확인, 로컬 HTML은 기존 독립 창), toast 상태 표시, logMessage/미지원 명령의 내용 없는 세션 진단 카운트 및 권한 관리 창 표시. 기능별 fixture 시험 추가. PrivateAPI 전체 규격 미확보, 실제 비공개 명령 미지원(hotkey는 2.0.164 참조). 기존 변환 후보 제한은 유지.
- SDK API 1/2, 공개 API 28개, Model 2, HTTP/WSS, 서비스·동적 속성·암호화/권한 및 HA 0.1.9 후보 유지. SDK 1.0 정식 선언 보류. Model 5 비활성, 실제 D200X/HA/절전·복귀 검증 별도.
- 소스 1차 점검: native SDK 효과 1개/입력 게이트, 외부 호환 호스트 Node.js/속성창 재사용 가능성, Ulanzi PrivateAPI 후보 차단 확인. 상세 DECKFORGE-SDK-EXPANSION-AUDIT.md. 실행 검증 아님.
- 2.0.164 원본 hotkey 공식 keylist 문자열 → 기존 Windows SendInput 검증 경로 연결. 입력 1회/dispatch, 활성 소켓·세대·만료 검증, 중복 실행 방지. 집중 fixture 및 자동 검증 성공; 실제 앱/실기 별도.
- 2.0.165 미등록 Ulanzi PI 임시 승인 런타임·초안 설정 반환 및 기존 저장/취소 연동. 별도 프로세스, 전역 설정 읽기 전용, 물리 입력/실기 출력 미연결. 권한 변경·절전·종료 취소 및 집중 mock 시험 추가; Windows #169/입력 #641/SDK #381/CI #1689/Store #109 성공. 실제 PI 별도.
- 2.0.166 원본 로컬 보존 제거/복원, revision 포함 폴더명·복원 검증, 실행 중단·재승인, 전역 설정/버튼 보존, 기존 도움말 제거 및 원본 복원 버튼, 집중 시험 추가. 완전 삭제·외부 백업 파일은 미지원. Windows #170/입력 #642/CI #1692/Store #112 성공, 동일 소스 SDK #385 성공.
- 2.0.167 설치/보존 원본 외부 .dfOriginalBackup 백업 및 복원, 파일 바이트/해시/경로/크기 검증·중복 설치 거부·미승인 복원, 기존 설정 보존. 암호화되지 않은 패키지 전용(프로필/전역 설정/권한 제외). 집중 시험 추가, Windows #171/입력 #643/CI #1695/Store #115 성공, SDK #387 성공; 동일 소스 문서 HEAD SDK #388 성공.
- 2.0.168 독자 SDK CLI validate/inspect/init/help 및 기존 package 공통 validator, JSON 메타데이터/비실행 검증·덮어쓰기 없는 템플릿, 집중 시험 추가. Windows #172/CI #1698/Store #118 성공, SDK #390 성공; 동일 소스 문서 HEAD SDK #391 성공.
- 2.0.169 독자 SDK 플러그인별 오류 알림 분류·횟수·최근 시각/현재 액션 상태 및 복구 시도·서비스/소켓 조회, 기존 도움말 실행 진단 버튼·복사, 내용 없는 세션 집계. 집중 시험 추가, Windows #173/입력 #644/CI #1701/Store #121 성공, 동일 소스 SDK #394 성공.
- 2.0.170 표시 전용 SDK CLI simulate: 실제 호스트, API1 Node/API2 별도 Electron 격리, 임시 사용자 데이터, 시나리오 버튼·노브·설정·절전/복귀 및 결과 JSON, 집중 Node/Electron 시험 추가. Windows #174/CI #1704/Store #124 성공, SDK #396 성공; 동일 소스 문서 HEAD SDK #397 성공. 외부 효과·서비스·자동 복구 시험 제외.
- 2.0.171 SDK CLI simulate HTTPS 요청 모의: 순서별 endpoint fixture·실제 호스트 응답 검증/continuation·정상/HTTP 오류/timeout/연결 실패, 미정의 요청/미사용 fixture 실패 처리, 요청 메타데이터만 기록. 집중 Node/Electron 시험 추가, Windows #175/CI #1707/SDK #399/Store #127 성공. 인증·WebSocket·실제 연결 제외.
- 2.0.172 SDK simulate Node 작업 결과 모의(실제 TrustedNodeTasks/임시 승인·실행 adapter) 및 설정 저장 ACK saved/rejected/unknown·설정 대기/복구 검증, 실제 Node 코드 실행·사용자 프로필 저장 없음. 집중 Node/Electron 시험 추가. Windows #176/CI #1710/SDK #402/Store #130 성공.
- 2.0.173 SDK simulate 전역 서비스 시작/중지/재시작·메시지·공유 상태, 전역 설정 메모리 vault 초기값/저장/충돌 fixture, 전체 컨텍스트 drain 및 실행별 임시 폴더, 집중 Node/Electron 시험 추가. Windows #177/CI #1713/Store #133 성공, SDK #405 성공; 동일 소스 문서 HEAD SDK #406 성공.
- 2.0.174 SDK simulate WebSocket·장애 주입 회귀 통과. Windows #178/SDK #409 성공.
- 2.0.175 SDK simulate 초기/단계별 기대값·오류 총계 정확 비교, 불일치 경로/실측값·검사 집계 및 CLI 실패 코드 유지, counter/HTTP/WSS 예제·README, 집중 Node/Electron 시험 추가. Windows #179/CI #1719/SDK #411/Store #139 성공.
- 2.0.176 SDK CLI Windows 실제 별도 Electron 실행 회귀(3개 예제+기대값 불일치 종료 1), 자식 환경/임시 입력 크기/정리 개선, 실제 플러그인 검증 체크리스트. Windows #180/CI #1722/SDK #414/Store #142 성공.
- 2.0.177 Fusion 검색 카드 실제 메뉴 탭/패널·다중 경로 표시, 기존 hover 전체 경로/설명, 미수집 fallback, 중복 ⓘ 제거(카드 클릭 상세·드래그 및 페이지 슬롯 독립 상세 유지). 집중 검사 추가. Windows #181/Fusion Manager #113/CI #1725/SDK #417/Store #145 성공.
- 2.0.178 Fusion 상세 목록 표시 제거. Windows #182/Fusion #114/CI #1728/SDK #420/Store #148 성공.
- 2.0.179 실제 Dice 1.0.3 원본에서 확인한 UUID-only PI 등록(전용 loopback listener), setactive 초기화, GIF XMP 무시 및 type3 gifpath 지원. 집중 회귀 추가. Windows #183(46162414545)/CI #1731 성공. SDK #424 성공. 업로드 원본 미수정; 실제 실행 및 500ms 재생 간격 별도.
- 2.0.180 원본 설치 후 통합 카탈로그·렌더된 액션 확인, 검색 초기화 및 플러그인 탭 전환. 등록 실패 명시/설치 파일 보존, UI/host 회귀 추가. Windows #184(46165509246) in_progress, CI #1734 in_progress, SDK #426 in_progress.
## 다음 작업
- 2.0.180 자동 검증, Dice 목록/실제 실행 및 GIF 속도 검증, Fusion GUI 확인, 실제 플러그인 검증 준비 및 실기, 실제 비공개 API는 근거 확보 후 개별 지원. $UA1 title/icon만, GIF 정상 키/500ms/32프레임, JPEG/WebP 1024px/256KiB 및 animated WebP 미지원. 원본 전체 해시 변경 시 재승인; 상용 원본/실기 별도.
- Store 0.1.19 NAS/실기 및 편집기 2.0.145 실기 미확인 상태 보존. Store/통합 환경설정/프로필·템플릿 공유/업데이트 UI 보류. 기존 상세 작업·빌드 번호는 이전 스냅샷 참조.
