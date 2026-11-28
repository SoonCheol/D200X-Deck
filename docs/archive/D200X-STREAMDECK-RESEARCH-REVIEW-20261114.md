# D200X × Stream Deck 7.6.1 다각도 조사 및 개발계획 재검토 — 2026-11-14

> **범위:** 기존 GitHub 내부 관찰자료·로드맵·코드와 Elgato 공식 가이드/7.6.1 릴리스 노트, Reddit 사용자 경험, UlanziTechnology 공식 Plugin SDK, 외부 `ulanzi-deck-open` 공개 자료를 대조. **Windows GUI/하드웨어 신규 실기, REA 재분석, 소스 수정은 수행하지 않았다.** 문서/출처가 다르면 원본 7.6.1 한국어 Windows의 기존 관찰을 UI 기준으로 유지하고, 동작은 공식 문서로 보강하되 실기 재검증 과제로 둔다.

## 근거 우선순위와 경계

1. **제품 기준:** 실제 수집된 Stream Deck **7.6.1 (23033)** 한국어 Windows GUI 관찰 — `research/streamdeck/7.6.1/desktop/09-24-action-inspectors-observed.md` 및 보존된 GUI/REA 보고서. 이 파일은 과거 관찰을 기록한 자료이며 이번에 다시 앱을 실행한 증거가 아니다.
2. Elgato 공식 사용법·지원 문서와 7.6.1 릴리스 노트. 일반 Elgato 모델 동작을 D200X에 바로 이식할 수 있다는 뜻은 아니다.
3. Reddit 실사용 보고: 장애·불편 가능성을 찾는 데만 사용. 개인 제보를 모든 장치에 대한 사실로 일반화하지 않는다.
4. Ulanzi 공식 SDK는 D200X **입력 이벤트·상태·다이얼 레이아웃** 관련 보조 근거. 외부 `edufalcao/ulanzi-deck-open`은 **macOS용 D200** 구현의 참고 사례이지 Ulanzi Studio 정식 Windows/D200X 메뉴와 동일하지 않다. 기존 편집기 UI를 가져오지 않는다.

## 출처별 확인 내용과 계획 수정

| 조사 항목 | 확인한 근거 | 기존 계획 대비 변경/결정 | 상태 |
| --- | --- | --- | --- |
| 기준 릴리스 | Elgato 7.6.1은 **2026-11-03 배포**, Windows 관리자 권한 앱의 핫키 처리도 개선한 버전 | `keybd_event`/PowerShell만으로 7.6.1과 동등하다고 보지 말 것. 관리자 권한 앱·게임·포커스 복귀를 별도 검증 | 확인/실기 대기 |
| 다중 동작 순차 실행 | 공식: 여러 하위 액션을 순서대로 실행, **다중 동작 안에 다중 동작 중첩 불가** | 범용 재귀 실행기를 먼저 만들지 않고 **허용 하위 액션 목록·중첩 제한·실행 취소/실패 정책**을 설계 | 계획 수정 |
| 명시적 지연 vs 기본 지연 | 공식: 별도 **Delay 액션**, ms 단위. 각 실행 단계의 **가상 키 누름 시간**과 **다음 액션 간격**은 서로 다른 설정. 공식 문서끼리 범위가 **2~100ms**와 **2~200ms**로 불일치 | 7.6.1 실제 속성창에서 최소/최대/기본값을 재확인하기 전 고정 수치 단정 금지. ‘지연 액션’과 ‘실행 단계 간격’ 설정 모델 분리 | **범위 미확정** |
| 다중 동작 스위치 | 공식 4.4: 상태 1/2의 **서로 다른 두 다중 동작을 번갈아 실행**. 내부 7.6.1 관찰: 상태 탭, 상태별 아이콘/제목 연결 | 기존 단일 `children[]`의 단순 토글이 아니라 **독립된 두 시퀀스·상태별 시각 정보·실행 완료 후 상태 전이** 설계. 다시 열기/페이지 이동/실패 시 상태 동작 조사 | 계획 수정 |
| 무작위 동작 | 공식: 후보 목록에서 임의 1개 액션 실행. 기존 한국어 UI에서 가중치·반복 방지 입력 없음 | 기본 기능에 가중치/무반복 옵션을 **추측해 추가하지 않음**. 후보가 비었을 때 동작·지원 액션 유형 조사 | 확인/세부 미확정 |
| Key Logic | 공식: 한 번 누르기/두 번 누르기/길게 누르기 3슬롯; 내부 관찰과 일치 | **다중 동작과 같은 순차 실행 기능이 아님.** D200X down/up·실제 두 번 누름 간격으로만 구분. 롱프레스 임계값은 원본 관찰 전 임의 확정 금지 | 설계 분리 |
| Key Logic과 복합 액션 조합 | Reddit 2025-10-31 스레드의 Elgato 담당자 답변: Key Logic은 자동 생성 가상 눌림으로는 동작하지 않고 **물리 눌림**이 필요하다고 설명. 다른 방향의 중첩도 사용자 요청으로 남음 | Key Logic을 Multi 안에 넣거나 Multi를 Key Logic 슬롯에 넣는 것은 7.6.1 허용 여부 실측 전 **비허용/보류**. 자동 이벤트로 물리 hold/double을 가짜 생성하지 않음 | 제약 추가 |
| 폴더 탐색 | 공식: 폴더/중첩 폴더, 돌아가기, **Auto Folder Exit 0~60초**; 내부 관찰: 폴더 내부 편집 진입 | 폴더는 Multi 자식 배열과 **별도 탐색 상태/경로**로 설계. 뒤로가기·자동 나가기·프로필/페이지 경계·화면 갱신 테스트 필요 | 계획 보강 |
| 페이지 | 공식: 프로필당 **최대 10페이지**, 페이지 추가 시 이전/다음 액션 자동 배치·위치 조정 동작. 페이지 표시기는 현재 번호만 표시 | 현 `migrateState`의 최대 128페이지와 동작 차이 발견. **기존 저장 데이터 절단 없이** 신규 UI 제약 및 이관 정책을 먼저 정하고, 물리 노브 페이지 기능을 유지할 것. 공식 가이드 내부 문장에 자동 키 삭제 허용 여부 상충하므로 7.6.1 UI로 확인 | **차이 발견** |
| 고정(Pinned) 키/폴더 | 공식 6.6+: 여러 페이지의 비어 있는 키에 동일 항목을 노출하고, 페이지별 덮어쓰기 가능 | 현재 우클릭의 ‘고정 기능 미구현’을 장식 메뉴가 아닌 **실제 페이지 상속/재정의** 과제로 추가. 노브의 global scope와 자동으로 동일시하지 않음 | 누락 과제 추가 |
| 프로필 | 공식: 프로필 전환, **Smart Profile은 전경 앱에 따라 자동 전환**; 편집기 열림 상태에서는 자동 전환이 꺼지는 정책 | 단일 `state.pages`를 프로필 목록으로 확장하기 전에 저장·이관 설계. 사용자 설정 손실 방지, 수동/자동 전환 우선순위, 기본 프로필, 전경 앱 감지 구분 | 우선순위 상향 |
| Soundboard | 공식: MP3/WAV/FLAC/M4A, play-stop/overlap/restart/loop-stop, **페이드 인/아웃 1~5초**·볼륨·출력 장치 선택 | 현재 HTMLAudio 기본 경로는 **부분 구현**. overlap 추적·fade·디바이스 라우팅·지원 형식 실제 확인을 별도 완료조건으로 설정 | 계획 보강 |
| 실행 지연 사용자 경험 | Reddit에서 멀티액션 중 단축키 미수신, 상태 중지/재입력, 지연·표시 오버레이 관련 사례 제보 | 독립 키 성공과 멀티액션 중 성공을 **별도 검증**, 포커스 변화/장시간 실행/두 번 누름 중단·중복 실행 정책을 사전에 명시 | 테스트 추가 |
| D200X 다이얼 | Ulanzi SDK: `Keypad`의 key down/up과 `Encoder`의 dial down/up/rotate 구분. D200X 다이얼 별도 레이아웃 크기·구성 제공 | D200X 물리 제스처가 어느 보고서로 오는지 확인 후 재사용, **Elgato 터치스크린 전용 기능 가정 금지**. UI는 Stream Deck 원본을 유지하고 D200X 고유 표시·통신만 참고 | 비교 결론 |

## Ulanzi Studio D200X 보조 조사 추가 — 하드웨어 지원과 제품 차이

- **Ulanzi Studio 포럼의 D200X 소프트웨어 설명**은 노브 조작을 회전 CW/CCW, 누름, **누른 상태에서 CW/CCW 회전**으로 구분한다. 기존 D200X 입력 파서/코어가 단순 좌·우 회전과 누름만 처리하는 상태와 차이가 있다. **장치 HID 보고서에서 누른 채 회전을 구별할 수 있는지는 현재 빌드에 대한 실기 로그로 별도 확인해야 하며, 확인 전 UI에 가짜 제스처를 넣지 않는다.**
- 공식 Ulanzi 포럼은 프로필 자동 추종과 D200X 와이드 화면·노브 설정을 설명한다. Stream Deck Smart Profile UI와 동작을 동일하다고 가정하지 말고 *Ulanzi 고유 동작의 보조 참고*로만 취급한다.
- Ulanzi Studio 측은 2026-07 포럼 답변에서 D200X의 **시간 경과에 따른 페이지 자동 복귀 기능을 당시 지원하지 않는다**고 답했다. 이것은 Elgato의 **폴더 Auto Exit**가 불가능하다는 뜻이 아니며, D200X용 새 편집기의 폴더 자동 종료는 호스트 소프트웨어에서 구현 가능한지 별도로 판단해야 한다.
- Ulanzi 공식 Studio 3.4.4+ 문서의 POP 메뉴는 **8개 동작 팝업을 노브로 선택**하는 별도 기능이다. 사용자가 요청하지 않은 Ulanzi POP UI를 원본 Stream Deck의 Random/Multi/Folder 기능으로 혼합하지 않는다.

**출처:** [Ulanzi Studio D200X 포럼 안내](https://bbs.ulanzistudio.com/thread-180-1-1.html), [Ulanzi 시간 기반 복귀 불지원 답변](https://www.bbs.ulanzistudio.com/archiver/tid-492.html), [Ulanzi POP 문서](https://docs.ulanzistudio.com/dialmini/en/software/pop-plugin.html).

## 다음 작업 순서 — 기존 계획 수정본

| 순서 | 작업 | 구체적 구현/검증 수락 기준 |
| --- | --- | --- |
| **0 (선행)** | **실행 엔진·데이터 모델 설계** | 단일 액션의 `type/settings`는 유지, 다중 동작용 순서 목록·스위치 독립 상태 1/2·랜덤 후보·Key Logic 제스처 슬롯을 **서로 다른 자료형**으로 명세. 금지 중첩과 허용 액션, 실행 도중 재입력/취소·실패 처리, 저장 재시작 정책 결정. 기존 `children[]` 데이터 마이그레이션 테스트 |
| **1** | **다중 동작 속성창(목록 편집) + 단일 공유 실행기** | 드래그 추가/삭제/순서 변경, ‘지연’ 단계, 명시적 실행 버튼, 순서 보장 및 실행 결과 표시. 빈 목록, 실패, 페이지 전환, 취소 처리 검증. 원본 7.6.1에서 기본 간격 UI를 재확인한 뒤 적용 |
| **2** | **다중 동작 스위치** | 상태 1·2 별도 하위 액션, 1→2→1 전환, 상태별 아이콘/제목, 재시작·중단·실패 시 전이 규칙. 무조건 ‘누르면 바로 상태 변경’으로 가정하지 않음 |
| **3** | **무작위 동작** | 7.6.1 후보 UI 대응, 한 번 누름=후보 1개 실행, 빈 목록/선택 분포 최소 모의 검증. 미관찰 가중치·반복 방지 옵션 추가하지 않음 |
| **4** | **Key Logic — 실기 게이트** | 실제 D200X down/up·두 번 누름/유지 이벤트를 확인한 뒤 3슬롯 구현; **명시적 preview는 물리 키 제스처를 검증한 것이 아님**. 동시 실행 및 다른 컴포지트 액션 중첩 제한 |
| **5** | **폴더·프로필·고정 키** | 폴더 내부 화면/뒤로가기/자동 종료, 프로필 저장/전환/전경 앱 연동, 고정 키/페이지 오버라이드. 현재 128페이지 지원과 원본 10페이지 차이는 데이터 손실 없는 정책 수립 후 별도 조정 |
| **6** | **기존 24개 속성 완성 및 P1 시스템** | 오디오 페이드·출력장치, 타이머 사운드, 텍스트 모드, 웹사이트 브라우저 선택, `open-app` hold 옵션, 마이크 음소거/출력 전환, 관리자 권한 앱의 단축키 전달. 원본 UI 별 확인항목 수립 |
| **7** | **종합 실기/배포** | 프로필 저장→재시작, 10분 유지통신/USB 재연결/빠른 노브 회전, 실제 Windows 앱 입력 포커스, D200X UI/밝기 바닥 실측. 기능 단위 CI는 가능하나 **EXE 빌드/병합은 사용자 별도 지시 전까지 보류** |

### 설계상 중요한 금지사항

- 컴포지트 액션을 **무제한 중첩 가능한 재귀 엔진**으로 먼저 만들지 말 것. 7.6.1 허용 관계 조사 후 유형별 제약을 둔다.
- 기존 24개 액션 메뉴와 승인 레이아웃 유지. ‘다중 액션’ 내부 편집은 원본 관찰에 맞는 **국소 화면 전환/속성 편집**으로 구현한다.
- `Key Logic`의 길게 누름·두 번 누름을 가짜 버튼 이벤트로 시뮬레이션해 실기 성공으로 보고하지 않는다.
- 기존 사용자 `localStorage` 프로필/페이지/아이콘의 일괄 삭제·재설정 금지. **마이그레이션 및 사용자 설정 백업 경로가 먼저**다.
- 외부 Ulanzi Desk 사례나 Elgato 최신 문서를 7.6.1 관찰과 다르면 그대로 복제하지 말고 **충돌/미확정 항목**으로 남긴다.

## 공개 근거 링크 (재확인용)

- [Elgato 7.6.1 Release Notes](https://help.elgato.com/hc/en-us/articles/52643738310417-Elgato-Stream-Deck-7-6-1-Release-Notes)
- [Elgato Multi Actions](https://help.elgato.com/hc/en-us/articles/360027960912-Elgato-Stream-Deck-Multi-Actions)
- [Elgato Customizable Multi Action Delays](https://help.elgato.com/hc/en-us/articles/7092527123725-Elgato-Stream-Deck-Customizable-Multi-Action-Delays)
- [Elgato 4.4 Release Notes — Multi Action Switch / Random](https://help.elgato.com/hc/en-us/articles/5162934218637-Elgato-Stream-Deck-4-4-Release-Notes)
- [Elgato Key Logic Guide](https://www.elgato.com/us/en/explorer/products/stream-deck/key-logic-stream-deck/)
- [Elgato Folders](https://help.elgato.com/hc/en-us/articles/360027957912-Elgato-Stream-Deck-Using-Folders)
- [Elgato Auto Folder Exit](https://help.elgato.com/hc/en-us/articles/22589649057933-Elgato-Stream-Deck-Auto-Folder-Exit)
- [Elgato Pages — 10 pages/profile](https://help.elgato.com/hc/en-us/articles/4410312027277-Elgato-Stream-Deck-Pages)
- [Elgato Pinned Keys/Folders](https://help.elgato.com/hc/en-us/articles/26638431612429-Elgato-Stream-Deck-Pinned-Actions-and-Folders)
- [Elgato Smart Profiles](https://help.elgato.com/hc/en-us/articles/360053419071-Elgato-Stream-Deck-Smart-Profiles)
- [Elgato Soundboard](https://help.elgato.com/hc/en-us/articles/360059017631-Elgato-Stream-Deck-Soundboard)
- [Reddit: Multi Action + Key Logic — Elgato 직원 답변 포함](https://www.reddit.com/r/elgato/comments/1oknhpc/stream_deck_multi_action_key_logic/)
- [Reddit: Multi Action 중 hotkey 미수신 사례](https://www.reddit.com/r/elgato/comments/rs6dzk)
- [Reddit: Multi Action Switch 재입력/쿨다운 불편](https://www.reddit.com/r/elgato/comments/1am9kyu)
- [UlanziTechnology UlanziDeckPlugin-SDK — manifest](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md)
- [UlanziTechnology UlanziDeckPlugin-SDK — README](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/README.md)
- [edufalcao/ulanzi-deck-open — macOS D200 참조 구현](https://github.com/edufalcao/ulanzi-deck-open)

## 검증 기록·종결 기준

- 이번 작업은 **문헌·기존 관찰기록과 소스 비교 + 계획 갱신**이며 실제 GUI/USB 검증 아님. 공식 문서 간 수치 불일치는 수치 확정 대신 재확인 과제로 유지.
- 후속 실행은 사용자가 요청한 기능 단위로 작게 나누고, GitHub CI + 해당 테스트 + 기기 실기 구분하여 보고.
- 기존 마지막 성공 프리뷰 EXE는 이번 기능 변경 이전 빌드임. 문서 변경만으로 새 실행 파일을 만들거나 완료 판정하지 않는다.
