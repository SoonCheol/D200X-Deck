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
