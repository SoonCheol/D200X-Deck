# DeckForge Store — 사전 설계 및 검증 기준
2026-11-27 · 사용자 승인 범위: 사전 준비/검증. 구현·배포·실기 검증 전.
## 1. 제품 범위
- 웹 카탈로그/관리자 페이지와 편집기 내장 스토어는 NAS의 단일 API, DB, 파일 저장소, 계정/권한을 공유한다. 로컬 설치본은 서버 원본과 별개이며 D200X에는 편집기에서 액션을 연결한다.
- 자체 플러그인, 아이콘팩, 타사 호환 패키지 보관. 타사 플러그인과 타사 아이콘팩은 소유자만 접근하는 비공개 보관함 기본값; 타사 플러그인은 초기 공개 기능 금지. 자체 배포 가능한 콘텐츠만 명시 게시. 원본 Ulanzi 등 미검증 파일은 보관 전용, 설치 금지. 출처/라이선스 및 이용조건 확인, 개인 보관 자체도 허용되는 범위 내.
- 초기 소유자 계정 하나, 회원가입 OFF. 공개 카탈로그는 비로그인 조회/다운로드 허용 후보(공개 배포 시작 전 확인). 타사 비공개 항목은 일반 로그인 회원도 조회·다운로드 금지. 사용자 요청 없이 NAS 외부 공개, 계정/도메인/볼륨 생성 금지.
- 웹은 카테고리, 검색, 정렬, 상세/스크린샷, 버전, 호환성, 다운로드, 관리자 등록/공개 설정. 내장은 동일 목록/상세 + 로컬 설치 상태, 명시 설치/업데이트/복원/제거. 기존 스타일과 카드 재사용. 웹의 앱 열기는 후속 단계(임의 URL 실행 금지). 결제/회원 업로드/자동 설치 제외.
## 2. 재사용 가능한 현행 코드 (HEAD 9d5c692)
| 소스 | 근거 / 제한 |
|---|---|
| app/deckforge-editor/deckforge-plugin.cjs | parseDeckForgePackage, packageNativeManifest, packageSdPluginDirectory. v1 호환/v2 독자; CRC, 경로·symlink·식별 정보 검사, 압축 40MiB/확장 100MiB/2500 파일, 독자 1MiB 제한 별도. CRC는 서명 아님. |
| app/deckforge-editor/main.cjs: sdk-install | 파일 선택→바이트 검증→planNativeInstall→권한/의존성/업데이트 확인→installNative/replaceNative, 호환 설치 분기. 다운로드 경로도 동일 검증/승인 함수로 연결해야 함. |
| app/deckforge-editor/icon-pack.cjs | parseIconPack/registerPack; 압축 60MiB, 확장 100MiB, 최대 2500 아이콘, 32개 로컬팩; SVG는 변환기 필요. NAS 서버에 Electron 의존 모듈 그대로 이식하지 않음. |
| docs/DECKFORGE-PLUGIN-FORMAT.md §0.7 및 버전 관리 | SemVer, 앱 버전·의존성, 이전 원본 보존, 프로필/설정 보존; 서버 자동 업데이트·서명은 미구현. |
## 3. 서버 후보
- 기존 repo/branch 내 독립 서비스 디렉터리 후보 store/; NAS Docker 단일 서비스 + SQLite + persistent volume(초기 개인용 저부하 가정, 부하 측정 후 확장). 기존 NAS 경로·포트·도메인은 미확인/미결정. 서버 프레임워크와 버전은 구현 전 공식 문서/보안 지원/lockfile 검증 후 확정. HTTPS reverse proxy 사용, 컨테이너 non-root, 별도 최소 권한, secrets 환경/파일 분리, 이미지/DB/패키지 백업 및 복원 시험. 운영 NAS에 직접 작업하지 않는다.
- DB: accounts(owner/user), sessions, items(opaque id,kind,owner,visibility,source,license,description,tags,verification), releases(item id,version,sha256,size,app requirement,platform,permissions,dependencies,validation status), blobs(content hash,size,storage key), audit. 파일은 webroot 밖 content-addressed immutable blob. 공개/비공개 dedup 내부만 허용; hash/파일 경로로 직접 다운로드 불가. 원본은 덮어쓰지 않음. 같은 ID/버전의 다른 내용 거부. 삭제는 우선 게시 철회, 물리 삭제 별도 승인/백업.
- API 후보: GET /api/v1/catalog, GET /api/v1/items/:id, GET /api/v1/items/:id/releases/:releaseId/download, GET /api/v1/items/:id/media/:mediaId; POST /api/v1/auth/login, logout, refresh; GET /api/v1/me; owner-only /api/v1/admin/items, releases, publish/unpublish. 페이지/검색/정렬은 권한 필터 후 실행. 비공개 썸네일·검색 제안·카운트·버전·로그에도 동일 권한. 요청마다 서버 정책 검사, deny by default, 비인가 항목 404; 캐시 private/no-store, range/HEAD도 인증. 공개 파일도 API를 경유해 정책 적용.
- 웹: Secure HttpOnly SameSite 세션 쿠키, CSRF 방어, 세션 만료/철회/로그인 rate limit, Argon2id 또는 검증된 비밀번호 해시, 관리자 초기 등록 1회 및 기본 비밀번호 없음. 내장: 동일 계정, 별도 철회 가능한 장치 세션(메인 프로세스 + Windows safeStorage), 비밀번호/token 렌더러·SDK·URL·로그 노출 금지. 웹 로그인 연동은 시스템 브라우저+PKCE/일회성 코드 검토, 미검증 custom protocol 금지.
- 업로드: 관리자만, staging 크기/파일 개수/시간 제한, quarantine, 검사 완료 전 공개·설치 금지. 확장자만 신뢰 금지. 서버 검사는 코드 실행/설치/외부 네트워크 금지, 별도 제한 worker. 원본에 악성 코드 없음을 구조 검사가 보증하지 않음. SVG/HTML 그대로 공개 렌더 금지. 호환 호스트 권한 위험 별도 경고. 클라이언트는 HTTPS 지정 서버에서만 다운받고 bytes 크기/SHA256/서명/manifest/ID/버전/권한/앱 요구사항 재검증, 임시 파일 이후 기존 확인 설치 경로. 해시만으로 게시자 신뢰 보장 안 됨; 공개 출시 전 서명·신뢰키 회전/철회 기준 검증.
## 4. 단계 및 통과 조건 (미실행)
S0 사전 설계/자료 확인: 이 문서. S1 계정·권한·DB·원본 저장 및 단위 테스트. S2 등록/검증/다운로드 API, 관리자 웹 + 카탈로그. S3 내장 카탈로그/계정·다운로드·설치 연결. S4 버전/복원/게시/서명 및 감사. S5 격리된 Docker 시험·백업 복원·Windows 통합 후 NAS 배포 승인. 실기 검증 보류, 출시 판정 분리.
| 검사 | 합격 조건 |
|---|---|
| 소유자 권한 | 비로그인/일반 사용자/만료·철회 세션의 비공개 목록·상세·검색·다운로드·썸네일·HEAD/Range·추측 ID 모두 차단; 소유자만 접근 |
| 파일 안전 | 잘못된 확장/포맷, zip traversal/symlink/bomb, 초과 크기, 해시/서명 불일치, 중복 버전 내용 변경, 권한 증가, 미검증 Ulanzi 설치 차단 |
| 로그인 | 기본 암호 없음, 횟수 제한, 세션 회전/철회, CSRF, 토큰 로그/URL/renderer 유출 없음 |
| 공통 저장 | 웹 등록→내장 목록 동일, 동일 blob 원본 1회 저장, 공개 철회 즉시 신규 요청 차단, DB/파일 장애 일관성, 재시작/백업 복원 |
| 설치 | 명시 승인·기존 검증/권한/의존성, 호환/독자/아이콘팩 분기, 취소/중단/오류 시 기존 데이터 불변; 사용 중인 액션/프로필 보호 |
| 운영 | HTTPS, non-root, 내부/외부 포트 검증, 권한 격리, 장애/용량/동시 다운로드/속도 측정; NAS 실환경 미검증 |
## 5. 참고 (직접 조회 2026-11-27)
- Elgato 공식 플러그인/아이콘팩 가이드: https://help.elgato.com/hc/en-us/articles/33589587352337-Elgato-Stream-Deck-Download-and-use-Plugins ; https://help.elgato.com/hc/en-us/articles/4402426848013-Elgato-Stream-Deck-Download-and-use-Icon-Packs . 검색/분류/상세/브라우저→앱 연결 및 계정 참고. 현재 가이드는 외부 브라우저 방식; 내장 직접 설치는 DeckForge 설계.
- Ulanzi 공식 제품 안내 https://www.ulanzi.com/collections/ulanzi-instructions/products/d200x-creative-deck 및 https://ugc.ulanzistudio.com/ . 자체 마켓 확인, UGC 페이지 텍스트 미노출로 실제 UI 세부 검증 보류.
- OWASP Authorization https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html (매 요청 권한 검증/기본 거부), Session Management 및 File Upload Cheat Sheets 참고.
## 6. 현행 제품 분리
2.0.117 CI #1586 및 SDK #278 성공, Windows #121 실패: 기존 제목 배경 VM 테스트의 applyTitleFont 추출 의존성 누락. 스토어 사전 설계와 별개로 수정 필요. 이전 성공 #118 2.0.114. 이번 문서 커밋은 앱/SDK 소스 및 버전 불변, NAS·계정·포트·배포 변경 없음.

## 7. 사용자 확정 변경 (내장 우선)
- 개인용 1명, 최대 10명 내외, DXP4800 Plus RAM 24GB. 단일 Docker/SQLite, Portainer Stacks Web editor에 보이는 Compose YAML, 관리자 추가 계정 방식, 회원가입/결제/다중 서버 제외. NAS/실기 접근 불가로 내장 먼저.
- 아이콘팩 중심 카드 카탈로그, 용도/네이밍/디자인 독립 필터, 실제 이미지 미리보기 검정 #000 기본(흰색 전환), 원본 불변. 기존 ON/OFF 파일명 규칙 재사용, HA 용도/네이밍 증거와 분리, 자동 분류 불확실 시 관리자 수정. 서버 업로드 시 대표 미리보기/전체 목록·메타 추출 후속.
- 2.0.118 1차: 로컬 설치 아이콘팩만 실제 표시, 이름/파일명/태그 검색, 이름 기반 용도·디자인 추정, 실제 같은 폴더 ON/OFF 쌍 집계, 상세 페이지 84개씩, 기존 가져오기. 서버/로그인/원본 업로드/자동 이미지 분석/플러그인 탭 미구현. 오프라인 동작, 가짜 스토어 데이터 없음. 기존 설치·편집기 상태 유지.
- 2.0.119 2차: 기존 승인 UI 유지. 팩당 최대 16개 균등 표본을 48px 캔버스로 분석(알파 64 이상, 색차/명도 및 점유율). 컬러/화이트/블랙/회색 및 화이트·블랙 라인 필터. 라인/솔리드는 명시 이름 우선, 미지정 투명 이미지의 점유율로 추정, 모호하면 미분류. GIF 첫 프레임 분석 후보/미리보기, 분석 실패 시 이름 기반. 원본 수정 없음, 전체 이미지 분석이나 의미 인식 아님. NAS/로그인/설치 연동 별도.
- 2.0.120 3차: 아이콘팩 기본 탭 유지, 플러그인 탭 추가. 기존 sdkList 실제 설치 목록의 독자 SDK/외부 호환 구분, 검색/버전/설치 및 사용 제한/선언 권한·의존성/액션 상세, 실제 제공된 래스터 아이콘만 표시(없으면 빈 표시). 기존 sdkInstall 승인 경로 재사용, 별도 설치 엔진·가짜 원격 목록 없음. 원격 계정/API 미구현.
- 2.0.121 사용자 정정: 기본 제공 플러그인은 기존 DeckForge 기능으로 관리, 스토어의 선택형 설치 목록에서 제외. 독자 HA, 호환 HA, Fusion(시작 시 기본 준비) 및 GitHub(앱 내장 추가/업데이트 제공) 4개 정확한 ID만 제외. 다른 독자 SDK 및 호환 플러그인은 그대로 표시. 이름/SDK 접두어로 일괄 제외하지 않음. 로컬 카탈로그 표시만 변경; 기존 관리 및 가져오기 엔진 불변, 원격 카탈로그/설치 정책은 서버 연동 시 같은 구분 적용.
- 2.0.122 연결/계정 클라이언트 계약: 사용자 지정 HTTPS origin(경로/인증정보/query/hash 금지), 주소만 별도 store-connection.json에 저장. 명시 GET /api/v1/health → {ok:true,service:"deckforge-store",apiVersion:1}, POST /api/v1/auth/login {username,password,client:"desktop"} → {accessToken,expiresIn:1..86400,account:{id,username,role:"owner"|"user"}}, POST /api/v1/auth/logout Bearer. 서버 구현 전 계약이며 실제 운영 연동 미검증. 초기에는 신뢰된 편집기 로그인 폼의 입력 순간만 암호를 취급하고 메인 IPC로 전달, 폼 즉시 비움. SDK에 노출 금지, 암호/토큰 영구 저장 없음, 토큰 메인 메모리만 유지(재시작 로그아웃), 추후 OS 암호화 장치 세션 검토. 주소 변경 전 로그아웃, 서버 철회 실패 별도 표시. 자동 연결·인증서 우회·리디렉션 금지, 8초/64KiB JSON 제한. 원격 카탈로그/설치 및 서버 검증 후속.
- 2.0.123 원격 클라이언트: 로그인 필수(공개 비로그인 접근은 보류), GET /api/v1/catalog?kind=iconpack|plugin&limit=20&cursor=... → {items,nextCursor}, GET /api/v1/items/:id → {item}. 항목: {id,releaseId,kind,name,version,author,description,tags,source:"deckforge"|"third-party",visibility:"private"|"public",packageId(플러그인),format,size,sha256}. ID는 1~96 ASCII 영숫자 시작 및 _-, SHA256 소문자 64자리, 형식은 기존 확장자. 타사/비공개는 owner만, 타사는 private만, 기본 제공 플러그인 제외. GET /api/v1/items/:id/releases/:releaseId/download → application/octet-stream 또는 application/zip; 40/60MiB 및 카탈로그 길이/해시 재검증, 60초 제한, 리디렉션 금지. 최신 상세의 releaseId/hash 일치 확인. 실제 파일 저장은 명시 경로 및 wx, 아이콘팩은 기존 파서/확인/등록(동일 ID 유지). 플러그인 직접 설치는 신뢰키/서명 검증 전 비활성. 서버 목록은 별도 모달/메모리만, 로컬 목록 보존, 서버 이미지 미리보기·원격 설치상태 비교·업데이트 후속. 실제 서버 미구현.
- 2.0.124: 기존 catalog item에 선택적 cover(순수 base64 PNG, 12KiB, 최대 512x512), 상세 GET 응답 최상위 previews(순수 base64 PNG 최대 12개, 각 64KiB, 512x512)를 추가. 목록 JSON 512KiB, 상세 1MiB, PNG 헤더/크기 제한 및 MIME data URI만 사용, 외부 URL/SVG 미허용. 실제 이미지 디코딩 무결성은 서버 생성/브라우저 표시 검증 후속. 설치 비교: 로컬 아이콘팩 archive SHA256 20자리 ID 일치 또는 storeSource {origin,itemId,releaseId,sha256} 연결 및 SemVer; 플러그인 UUID/버전(동일 버전은 동일 바이트 보증 아님). 이전 수동 설치는 정확 ID 일치 외 추정하지 않음. 새 버전 별도 팩 등록, 기존 버튼·팩 보존, 사용자 승인. 실제 NAS 미검증. 플러그인 직접 설치 서명/신뢰 검증 후속.
- 2.0.125: 사용자 별도 전달 Ed25519 SPKI 공개키 PEM을 서버 origin에 수동 등록(지문 SHA256 확인) 또는 철회. 서버 주소 변경 시 신뢰 해제. 서명 객체 {keyId:SPKI DER SHA256 hex,value:64바이트 서명 canonical base64}, 서명 메시지는 UTF-8 JSON 배열 ["DeckForge Store release v1",origin,id,releaseId,kind,packageId,name,version,format,size,sha256,source,visibility] (JS JSON.stringify, 공백 없음). origin은 정규화 HTTPS origin. 키를 API로 자동 수신/승인하지 않음. 자체 독자 SDK 패키지 직접 설치는 서명/다운로드 크기/해시/내부 ID·이름·버전 재검증, 기본 제공/변환/외부 호환 제외, 항상 기존 권한/의존성/버전 승인창, 실행 직전 세션/신뢰 재확인. 기존 로컬 설치 경로 유지. 직접 설치는 신뢰 키 등록 후에만 활성. 서버 서명 발급/키 회전 운영/실환경 검증 미구현.
