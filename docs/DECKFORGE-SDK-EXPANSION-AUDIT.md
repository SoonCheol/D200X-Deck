# SDK 확장 1차 소스 점검

기준: 2.0.145 / 1a4156aec17bcc57c50a26c8f3ab827545cc4523. 2026-11-28. 정적 소스 점검이며 실행·빌드·실기 검증이 아니다. 경로는 app/deckforge-editor/ 기준.

| 영역 | 확인한 현재 구현 | 개선 방향 |
|---|---|---|
| 독자 SDK 권한 | deckforge-native-sdk.cjs 22행 EXTRA_PERMISSIONS: OS/파일/창 권한 없음 | 기존 API 1/2 유지, 명시적 확장 실행 경로 |
| 권한 효과 | 같은 파일 371–463행 validateScriptOps: 최대 16개 op, 입력 이벤트 중심, 일반 권한 효과 1개, socket batch 예외, 서비스는 네트워크 중심 | 순차 효과/결과/실패 처리 기능별 설계, 기존 저장 수명 검증 보존 |
| 브라우저 | 같은 파일 446–450행 press 전용, HTTP(S) URL 검사; 470행 인근 manifest digest 기반 승인 조회 | 사용자 승인 경로 재사용, 불필요한 반복 확인 및 이벤트 제한 검토 |
| Node.js | sd-plugin-host.cjs 498–535행 원본 Node CodePath 별도 child process spawn, 종료·stderr 오류 분류 | 독자 SDK 및 Ulanzi 확장 실행 기술 재사용 검토. PowerShell/COM/외부 모듈은 실제 실행 검증 필요 |
| 외부 HTML | sd-plugin-host.cjs 536–543행 sandbox BrowserWindow, window.open 일괄 deny | 기존 호스트를 유지하며 별도 창/모달 허용 계약 설계 |
| 속성창 | sd-plugin-host.cjs 700–747행 scoped BrowserWindow, 모달, Fusion 위치 조정, inspector socket 등록 | 독자 SDK 사용자 정의 속성창에 기존 창/IPC/수명 관리 재사용 검토 |
| Ulanzi | ulanzi-converter.cjs 152행 PrivateAPI 표시, 309행 !manifest.PrivateAPI로 후보 차단 | 표시 자체와 실제 API 지원 분리. 원본 실행 호환 목표; 기존 제한형 변환 후보 설치 정책은 검증 전 유지 |
| Ulanzi 속성창 | ulanzi-converter.cjs 304–306행 정적 schema bound 필요 | 원본 HTML/JS 및 리소스 실행 호환 우선 |

후속: runner·network·설정·패키지·테스트 전체 관련 경로, Ulanzi 및 Elgato 공식 규격 기능 대응, 권한/실행 계약과 회귀 시험 설계. 미확인 항목을 지원으로 간주하지 않는다.

## 추가 실행 경계 및 공식 SDK 비교 (2026-11-28)
- deckforge-js-runtime.cjs 125–195: 비영구 partition, Node 비활성, 직접 요청/창/탐색 금지, 실행 1.5초, 매 이벤트 realm reset. 이 경로는 기존 API 2 전용으로 보존한다.
- deckforge-native-network.cjs 21–60: 사전 선언한 canonical HTTPS/WSS endpoint·요청 및 응답 제한. 별도 신뢰 런타임은 이 제한형 네트워크 API를 강제하지 않는 설계 대상으로 검토한다.
- sdk-inspector-scope.cjs 31–69: 플러그인 root 범위 custom scheme, local file 경계, 자식 modal 허용(depth 2), 외부 URL 브라우저 위임. 독자 UI 및 Ulanzi openView 재사용 후보.
- sd-plugin-host.cjs 64–106: HTML/Node CodePath만 허용, Windows 전용 CodePathWin/EXE 원본 실행은 후속 비교 대상. 현재 Node 버전 확인은 최소 major 기준이며 ABI 호환 검증과 구분한다.
- deckforge-plugin.cjs: ZIP 파일 수/확장 크기 제한, 기존 v1/v2 패키지 검증. 원본 실행 추가 시 별도 runtime 타입 및 기존 설치 경로 보존 검토.

| 기능 | Elgato 공식 규격 | Ulanzi 공식 규격 | DeckForge 개선 대상 |
|---|---|---|---|
| 실행 진입점 | Node.js, Windows EXE/CodePathWin | HTML/Node.js | 신뢰 Node 공통화, OS별 entry 지원 검토 |
| 사용자 정의 UI | PropertyInspectorPath, DefaultWindowSize | HTML inspector, openView | 원본 UI 및 공통 scoped 창 재사용 |
| 파일/폴더 선택 | Node/HTML 런타임 기반, 전용 API 비교 추가 필요 | selectFileDialog, selectFolderDialog 및 결과 이벤트 | 사용자 선택 경로/결과 전달 |
| 서비스/설정 | Node backend 및 HTML frontend | 상시 main service와 inspector 메시지 | 서비스·설정·컨텍스트 수명 매핑 |
| 디버깅 | Nodejs.Debug, profiler | Inspect 및 host debug 옵션 | 명시적 로컬 개발 모드 |
| PrivateAPI | 해당 Ulanzi 필드 없음 | private API 사용 여부 메타데이터 | 실제 API 호출 및 동작 별도 판정 |

공식 자료: https://docs.elgato.com/streamdeck/sdk/references/manifest/ · https://docs.elgato.com/streamdeck/sdk/guides/ui/ · https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/ · https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md · https://github.com/UlanziTechnology/plugin-common-node/blob/main/README.md . 2026-11-28 확인. 전체 API 대응표 및 실제 패키지/ABI/COM/PowerShell/Windows 시험은 아직 미완료.

## 4단계 첫 구현 (2.0.146 후보)
기존 Node runtime 검증과 spawn을 deckforge-node-runtime.cjs로 분리, 호환 호스트에서 재사용. API 1/2의 권한 정책 및 기존 등록 인자/환경/프로세스 생명주기 유지. 신뢰 플러그인 실행 경로의 공통 기반이며 독자 SDK OS 접근 공개 API 추가는 아직 아니다. 파일·로컬 모듈·리터럴 인자와 버전 검사 회귀 테스트 추가. 컨테이너 Node.js 22.16.0 독립 모듈 문법/스모크 성공, 실제 호환 호스트/Windows/PowerShell/COM 검증은 별도. 다음은 신뢰 런타임 등록·설치 승인·IPC/수명 계약 구체화 및 기존 경로 회귀 검증.
