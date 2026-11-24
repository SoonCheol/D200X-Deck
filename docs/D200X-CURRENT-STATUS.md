# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 스냅샷, 누적 금지.

## 개발 기준
- 저장소 SoonCheol/D200X-Deck · 브랜치 codex/streamdeck-761-clean-editor · Draft PR #5 유지.
- 로컬 E:\Codex\DeckForge. 최신 HEAD는 Git에서 확인. 소스 버전 **1.1.182** (03 이미지 합성·스케줄러 후보).
- 감사 기준 소스 `49ba39fe094ee808c5715f2348be0789f61d5e20`. CI #1221 성공(커넥터 확인); Windows #930 성공(사용자 인수인계, 이번 문서 작업에서 재검증하지 않음).

## 현재 상태
- 독자 SDK API 1/2, 공개 25개 함수, HTTP/WSS, 전역 서비스/공유 상태, 동적 속성, 암호화·권한·패키지, HA 0.1.3 및 Stream Deck 호환 호스트 구현. SDK 1.0 정식 완성 선언 보류.
- 1.1.177: HA 기기명 자동 제목 및 글꼴 팝오버 개선, 기존 제목 보존. 사용자 이전 실기: HA 인증·기기 목록·전등 제어·온습도·배터리 표시 성공. 초기 이미지 지연/편집기 깜박임 보고; 최신 실기/성능은 별도 검증.
- 1·2차 감사 합의와 3차 보고서 검토를 기반으로 재설계 방향 및 단계 순서 사용자 승인. 3차 전체 및 핵심 소스 대조 완료; 1·2차 원문 재검토, 전체 19개 경로 및 44개 테스트 독립 검증은 미실시.
- 소스 대조: DOM 교체·중복 합성·설정 receipt 위험 확인; 기존 1권한효과 제한과 epoch/settingsRevision, WSS 오류 종료 처리 존재. 미저장 실기 미리보기 의도는 정책 결정 전 보존.
- 01 검증 기준선: 기존 44개/워크플로 8개 대조, 누락 4개 확인. 2개 오래된 검사 경계 수정 및 Windows 통합 검사에 남은 8개 등록, 신규 인벤토리 검사 포함 총 45개. CI #1225 성공, Windows #932 검사(추가 등록·Fusion 포함) 및 EXE 패키징 성공, 설치 프로그램 생성 진행 중 확인. 01 소프트웨어 기준선 통과. 런타임 소스 변경 없음; 1.1.178은 기존 자동 릴리스 태그 충돌 방지용.
- 02A: sd-plugin UUIDv4, 정규화·중복 방지, 복제·복사·가져오기·템플릿·백업·AI 처리 및 집중 검사 추가. 고정 등록은 현행 로컬 override를 보존하는 복사이므로 신규 pinned ID. 1.1.179 CI #1226·입력 #486·Windows #933 성공. 02B: 세션별 mountGeneration, 커밋된 설정 기반 등록, UUID 설정 저장 방어, IPC 등록 검증·즉시 이전 mount 폐기 및 테스트 추가. 1.1.180 CI #1227·입력 #487·Windows #934 성공(릴리스 게시 포함). 03A: 버튼 DOM 유지, 디코딩 후 원자적 교체, revision/owner 검증, 공통 합성기 visual descriptor·제한 LRU/in-flight 중복 제거, 폰트 세대와 렌더 시점 캡처. 미구성 SDK mount 제외 보완. 1.1.181 Windows #935 시작 화면 모의 테스트의 prepareDeckKeyImage 미주입 실패 확인/수정. 03B: single-flight, page epoch 및 슬롯 dirty revision, 실패 후 제한 재시도, wide 동일 스케줄러, stale decode/실패 재시도 보완. 1.1.182 전체 검증 대기. 04 이후 미착수. Model 5는 보안/프로세스 격리 검증 조건부 목표, 개별 키 USB 기본 OFF, HA 제어 자동 재실행 금지.

## 다음 작업
- **03 이미지 합성:** 1.1.182 통합 검사 확인 후 04A 실행 풀 설계. GUI/성능/D200X 실기 검증 별도. 기존 실기 미리보기 정책 유지. 설정 revision/receipt 상세는 05에서 계속. 사용자 연속 개발 승인 유지.
- 이후 02 식별자 → 03 이미지 → 04A/B 실행 엔진 → 05 저장 → 06 통신 → 07 범용 schema → 08 관리 → 09 USB → 10 출시 검증.
- 기존 기능/데이터/API·보안 보존, 테스트/CI/Windows/실기 구분. 미측정 성능 수치 단정 금지.

## 참조
- [SDK 계약 및 재설계](DECKFORGE-SDK-1.0.md) · [잔여 로드맵](D200X-STREAMDECK-ROADMAP.md).
- [UI 계약](DECKFORGE-UI-CONTRACT.md) · [데이터 계약](DECKFORGE-DATA-CONTRACT.md) · [패키지 형식](DECKFORGE-PLUGIN-FORMAT.md).
