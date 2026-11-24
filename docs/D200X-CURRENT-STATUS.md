# DeckForge 현재 작업 상태
> 2026-11-24 · 현재 상태만 유지, 과거 이력 누적 금지.

## 개발 기준
- 저장소: SoonCheol/D200X-Deck · 브랜치: codex/streamdeck-761-clean-editor · Draft PR #5.
- 로컬: E:\Codex\DeckForge. 최신 HEAD는 Git에서 조회. 소스 버전 **1.1.172**.
- 마지막 검증 성공 소스: 1.1.170 `7e623f2` (CI #1211, Windows #921, 입력 #479 성공). 1.1.171 CI #1212·Windows #922 성공. 1.1.172 검증 대기.

## 완료된 소프트웨어 작업
- 독자 SDK API 1 선언형 / API 2 JavaScript, 공개 함수 25개(1.0 기준선 19 + WSS 3 + 공유 상태 2 + 서비스 메시지 1). 권한·샌드박스·설정 암호화·동적 그림/GIF·와이드·패키지/버전/의존성 구현.
- HTTP GET/POST/PUT/PATCH/DELETE, 승인 동적 경로/쿼리/헤더, TLS/취소/응답 제한.
- WSS 연결/송수신/종료, 선택형 최대 3회 재연결, ping/pong, HA 호스트 인증. 버튼 컨텍스트는 페이지 이탈 시 종료; 전역 서비스 WSS는 페이지와 독립.
- Stream Deck 호환 호스트 공존, Ulanzi 제한형 분석/변환 및 검토 도구 구현. 범용 변환 및 모든 외부 플러그인 호환은 미확정.

## 최신 자동 검증 (1.1.168)
- [CI #1208 성공](https://github.com/SoonCheol/D200X-Deck/actions/runs/45347804941).
- [Windows #919 성공](https://github.com/SoonCheol/D200X-Deck/actions/runs/45347798437): native 79/79, 실패·skip 0; 실제 Electron 22개 API, 암호화 vault, 실제 loopback TLS HTTPS/WSS/HA 프로토콜, 예제 패키지 왕복 통과.
- [설치본 artifact](https://github.com/SoonCheol/D200X-Deck/actions/runs/45347798437/artifacts/14898304308).
- 실제 외부 HA 서버 및 D200X 독자 SDK 실기 미실시. 기존 HA 연동은 유지. SDK 정식 출시 완료 선언 금지.

## 다음 작업
- 우선순위 1·2(WSS/HTTP): 소프트웨어 검증 통과. 실제 HA/D200X 실기는 전역 실행 엔진 이후 통합 검증.
- 우선순위 3: 1.1.169~170 전역 service/권한·페이지 독립 WSS/tick·공유 상태·수명/자원 제한, 시작/중지/재시작 및 중지 설정 보존, 버튼→서비스 메시지 구현. 신규 검증 확인 후 실제 서비스 통합 검증.
- 사용자 승인: HA 전용 플러그인 우선. 1.1.171 WSS 대량 수신, 1.1.172 동적 선택/공유 상태 확장 및 HA 전용 플러그인 0.1.0 후보 구현. 다음 자동 검증·실제 HA 목록/버튼 표시·기기 제어 검증·UI 및 성능 개선. 이후 시스템 이벤트/내장 액션, 호환 SDK·Ulanzi·공개 플러그인. 상세 [로드맵](D200X-STREAMDECK-ROADMAP.md).

## 주제별 참조 (필요할 때만 읽기)
- [SDK 최신 계약](DECKFORGE-SDK-1.0.md) · [패키지/변환](DECKFORGE-PLUGIN-FORMAT.md).
- [UI 승인 계약](DECKFORGE-UI-CONTRACT.md) · [데이터/설치/기능 보호](DECKFORGE-DATA-CONTRACT.md).
- [1.1.168까지 과거 전체 개발 이력 및 당시 검증 목록](archive/D200X-CURRENT-STATUS-through-1.1.168-20261124.md). 최신 상태 판단에는 이 문서와 코드 우선.
