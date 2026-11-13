# Stream Deck 7.6.1.23033 — REA 정적 분석 기록

## 대상과 세션 상태

- 대상: C:\Program Files\Elgato\StreamDeck\StreamDeck.exe (x86-64 PE)
- SHA-256: d9487481d42e5c8d13254c813d5c80158fb58d77c37e8c89036549f3aae38618
- 도구: REA 6.8.0, Ghidra 12.1.4. 최초 자동 분석 완료 증거: ev_8bdc88ad182cd16e57856209765eff14da14089bbd0d7dc95511e80f1a916d60.
- 이번 이어하기에서 REA binary_session은 open:false, cleanup_pending:false를 반환했다. get_evidence_bundle로 기존 Evidence ID를 조회한 결과 현재 서버의 total_retained_records와 matching_records는 모두 0이었다. 앞선 작업에서 스냅샷이나 Evidence 번들을 저장하지 않았으므로 기존 Ghidra 작업 상태를 복구하지 못했다. 자동 분석은 재실행하지 않았다.

아래 FUN_ 주소는 Ghidra가 붙인 함수명이다. 디컴파일 결과는 원본 소스코드가 아니며 정적 코드 경로가 실제로 실행됐다는 뜻도 아니다. Evidence ID는 이전 세션에서 받은 값을 유지했다.

## 확인된 함수 호출 관계

| 호출자 | 피호출자 | 근거 |
| --- | --- | --- |
| 0x14013ddb0 | 0x1403a5140 | 시작 함수 디컴파일 ev_058b8f01af204f201cbc55abfa13f88e3f547be8fa3c7752cccab5a07fca6c3c |
| 0x1403a5140 | 0x140409ea0 | 디컴파일 ev_45ad10ac7a32583a49d6de7764da1727c0ce1af938dbc466eb5a406f8fc3f2ae |
| 0x140409ea0 | 0x14040a0c0 | 호출자 교차 참조 ev_1cc17fef624f41e6f1533f13f62cc1ee8df6ae9b97ec403a4340e90516316860 |
| 0x14040a0c0 / 0x14040ae10 | 0x1404540f0 | 호출자 교차 참조 ev_f0f9e062021a3b15d621201f6630f1f5f1fc4b7c36bc18f6f37d8420ad6b2caf |
| 0x1404540f0 / 0x140454ec0 | 0x140452510 | 호출자 교차 참조 ev_0bd559339a7eab706f4eae571067eb7d05e1755dcb60cc797a372eca94001db1 |
| 0x140452510 / 0x140452960 | 0x1403d6ac0 | 호출자 교차 참조 ev_0b69b29ca6296f63d1f85a4d6bdda40529889edd5dde8c32ea9705e1e16e6ba5 |
| 0x14040a0c0 | 0x14040b8b0 | 호출자 교차 참조 ev_b30a9371d2e1cc07a6e799c04ce0071b5efa66452e8767a0cd9de25994bed3cd |

교차 참조 결과는 Ghidra가 해결한 직접 호출을 가리킨다. 해결되지 않은 간접 호출은 포함되지 않는다.

## 메뉴와 UI — 확인된 사실

| 함수 | 디컴파일 근거 | Evidence ID |
| --- | --- | --- |
| 0x140150040 | 메인 창에 CanvasView, ActionSourceView, QMenuBar를 만들고 QMainWindow::setMenuBar를 호출한다. | ev_e6fbe777014822200fb710643944ca32b94961d65c18f56fc127cafb65b8ff43 |
| 0x140153e70 | ESDSystemTrayMenu와 ESDAppMenuBar 객체를 만든다. MainWindowMenuBar라는 이름을 설정한 뒤 QWidget::hide를 호출한다. | ev_421f01f57f7d500a9c6b16ec289c374c4e2a192924400186828a791cabcb906d |
| 0x1401dcd40 | 트레이 QMenu와 QSystemTrayIcon을 만들고 연결한다. Configure Stream Deck, ShowPreferencesAction, Quit Stream Deck, OpenElgatoMarketplaceAction을 생성하고 triggered 신호를 연결한다. | ev_9084c4f5a8fef53827cb2e53cdf44b21c260d3b7ac59c4cc6d14cc3b6cd6e1fd |
| 0x1401dd670 | 메뉴 표시 직전 clear 후 다시 구성한다. 순서는 Configure → 구분선 → 기기 항목 → Preferences → Marketplace → 구분선 → Quit이다. 기기 집계값이 0x15 이상이면 비활성 Devices 머리글과 기기별 하위 메뉴를 만든다. | ev_7fe51ab949d6b47ebf88a9f7876f1bfdf53b80e53305ef9b48e38661ae4d2795 |
| 0x1401dde10 | 기기 항목에 조건부 Show Action Bar/Hide Action Bar 액션을 추가하며, 다른 조건에서는 프로필 액션 생성 함수를 호출한다. | ev_a29e2051ebc9f315b5472d8882a0356050420ef209b085209e86be65aa189607 |
| 0x1401de1d0 | 프로필을 순회해 체크 가능한 QAction을 추가하고 현재 프로필을 체크한다. | ev_8e55ce5deb387f2c7db73cf5fdf87ad11b62d1d9b2d114ee0cf352cf986494af |

ShowPreferencesAction과 OpenElgatoMarketplaceAction의 화면 표시 문구는 위 디컴파일에서 데이터 주소로 전달되어 직접 확정되지 않았다. 트레이 외의 앱 메뉴와 컨텍스트 메뉴 전체 항목 트리는 아직 확인하지 못했다.

## 플러그인 검색과 로드 — 확인된 사실

| 함수 | 디컴파일 근거 | Evidence ID |
| --- | --- | --- |
| 0x14013ddb0 | 시작 코드에서 Plugins 경로와 별도 플러그인 경로를 구성하고 로드 래퍼 0x1403a5140을 각각 호출한다. 첫 경로는 실행 파일 위치를 구하는 0x140808540과 경로 결합 함수 0x14019b2e0을 통한다. 두 번째 경로는 0x14019b770을 통한다. | ev_058b8f01af204f201cbc55abfa13f88e3f547be8fa3c7752cccab5a07fca6c3c |
| 0x140409ea0 | 플러그인 폴더 경로가 없으면 오류를 내고 디렉터리 반복자로 엔트리를 순회하며 0x14040a0c0을 호출한다. | ev_bf6a5ad3a885fb3af47866c6875654f95bd3038006e56f945c946c8bfc2962e4 |
| 0x14040a0c0 | 엔트리가 디렉터리인지 확인하고 .sdPlugin 확장자를 검사한다. manifest 로더를 부른 다음 UUID 중복, OS/버전 지원, 최소 Stream Deck 버전, 액션 중복 처리 분기를 거쳐 액션 등록 함수를 호출한다. | ev_69bd7d67a7c3ff8be5821821d71afb06cc3c2312175333050d83674cf198c3d3 |
| 0x14040b8b0 | manifest의 액션 목록을 순회해 기존 등록 액션과 충돌하는지 확인한다. 신규 액션에 대해 0x14040c720을 호출한다. | ev_265b59401104acaaea4594fd9553f15008d5bc89d9439b1805c07b79282731c7 |
| 0x14040ae10 | 별도의 플러그인 읽기 경로에서도 디렉터리와 .sdPlugin을 검사하고 manifest 로더 및 검증 함수 0x14043f330을 호출한다. | ev_ffa8c4c7a8d68b933026153422e5866e35873d55f24e9668373b609771188a88 |

.sdPlugin 문자열은 0x141647f68에 정의되어 있고 교차 참조는 5곳이다. 문자열 증거 ev_e4334733aa1b490e3705faf2f5fe827dbe6238028f9932e236c1547b400a10d7; 교차 참조 증거 ev_e27cdab961cff03f2e71711205ecca3d09deeb24c71e9169f7b1e2514b2a4ee5. 일반 manifest.json 문자열은 0x141648410에 있으며 여러 코드 경로에서 참조된다. 문자열 증거 ev_45718df8a8b4ee6c197b0d8781ebe8873751fd743a7371ef862e50b9f7b67e4c; 교차 참조 증거 ev_b9b27b9ddd2756cdf683fa6033948ad225918229df2b2e7475818b2911d5a1e2.

0x14019b770은 Plugins를 데이터 경로 생성 함수 0x14019b510에 전달한다 (ev_e97964076ba3d62c60233cd68746e5c26630adb64b791c891b5f12f8cca24cf0). 0x14019b510은 설정 경로가 존재하면 해당 경로를, 아니면 기본 경로를 사용한다 (ev_bf9ec85529c4e147a99c390f787749de926ea3b4f138b9081d2cef4893671a4e). 기본 경로 함수 0x140808750에는 SHGetKnownFolderPath와 Elgato 경로 구성 코드가 있다 (ev_570b422ded1560951a3be39be11a0a7885338be71de95926f219b54b86da2b5b). 정확한 Known Folder ID와 실제 사용자별 경로는 미확인이다.

## manifest 읽기와 파싱 — 확인된 사실

- 0x1404540f0은 플러그인 경로에 manifest.json을 결합해 파일을 연다. 일반 파일 읽기와 private manifest reader 분기가 있으며 둘 다 0x140452510을 통한다. 실패하면 Failed to deserialize manifest 예외를 생성한다. Evidence: ev_126ff926bcca6ac26e1240897aba30ebd9d21204be89bd2cca7d2a44083c187d.
- 0x140452510은 0x1403d6ac0을 호출해 필드를 채우고 유효 플래그를 설정한다. Evidence: ev_9625ba9f69820fdcb7ed07d7fcadb8010d150c0c54e5d841b71516a7ff87d982.
- 0x1403d6ac0에서 확인한 최상위 키: UUID, SDKVersion, PrivateAPI, Software, Name, Version, Author, Description, URL, SupportURL, Icon, Category, CategoryIcon, OS, CodePath, ApplicationsToMonitor, Profiles, PropertyInspectorPath, UIVersion, DefaultWindowSize, Actions, IconEditorPath, IconMenuItem, Nodejs. Evidence: ev_cda8263dfddbc86ff691d99c15a8296b0131b5e6c19f2efcb357bacb4655339c.
- 별도 ZIP 처리 함수 0x14055f020은 패키지 내부의 /manifest.json을 찾고 그 내용을 0x140454ec0에 전달한다. 폴더 순회 경로와 별개의 코드 경로다. Evidence: ev_1f4e36b7a2da39877d24c443d61f11414cdf8f5824a9bd8ddafb2cd7d779f7e0, ev_17379e2206d01c7c59754a543f1184ba43836db87b46d3548856a9f05df73c07.
- *.sdProfile/manifest.json 참조는 프로필 처리 함수 0x1404321c0에 속한다. 플러그인 manifest와 구분해야 한다. Evidence: ev_58a3958f260ef24486788fa84b7ad0b9d7395af56c45c327b73aee6e0ac261f8, ev_c1009a8e10571ac161b95373585986a981c7b1c606c1f56e1106622cdbc7df3c.

## 추정과 남은 작업

- 추정: 시작 시 두 검색 경로는 설치 폴더의 기본 플러그인과 사용자 데이터 폴더의 플러그인을 각각 로드하기 위한 것으로 보인다. 경로 구성과 호출 순서가 근거이며, 실제 실행 경로는 관측하지 않았다.
- 추정: 0x14040a0c0은 로그 문자열 esd::plugins::Storage::load와 확장자 검사, manifest 읽기, 액션 등록이 이어지는 점에서 플러그인 저장소의 로드 구현으로 해석했다.
- 남은 작업: 트레이 외 앱 메뉴와 컨텍스트 메뉴의 전체 항목 및 콜백, manifest 각 필드의 필수 여부와 기본값, private manifest 형식, 플러그인 프로세스 실행 및 IPC, 정확한 사용자 데이터 폴더.
- 현재 REA 세션과 보관 Evidence가 없으므로 추가 Ghidra 디컴파일에는 새 자동 분석이 필요하다. 사용자 지시에 따라 실행하지 않았다.

원본 실행 파일과 플러그인 파일은 변경하지 않았다.
