# 04. 액션 인벤토리

## 설치 후 관찰

키 탭을 끝까지 스크롤해 이 환경에서 표시된 24개를 확인했다. 오른쪽 플러그인 탭과 환경설정 플러그인 목록은 비어 있었다. 개별 동작의 바이너리 소속과 다이얼 지원 여부는 별도 확인이 필요하다.

| 범주 | 설치본에 표시된 이름 |
|---|---|
| Soundboard | 오디오 재생, 오디오 정지 |
| Stream Deck | 타이머, 밝기, 잠자기, Virtual Stream Deck 토글 |
| 다중 동작 | 다중 동작, 다중 동작 스위치, 무작위 동작, Key Logic |
| 시스템 | 웹사이트, 단축키 전환, 단축키, 열기, 응용 프로그램 열기, 닫기, 텍스트, 멀티미디어 |
| 탐색 | 폴더 생성, 프로필 전환, 이전 페이지, 다음 페이지, 페이지로 이동, 페이지 표시기 |

[목록 상단과 아이콘](screenshots/01-main.png) · [목록 하단과 아이콘](screenshots/04-actions-lower.png). [타이머](screenshots/07-timer-inspector.png)는 초시계 아이콘이며 속성에 제목, 지속(기본 30초), 사운드(관찰값 접속), 아이콘과 제목 스타일 컨트롤이 있다. 나머지 동작의 세부 속성과 실행 조건은 개별 검증하지 못했다.

## 초기 조사 기록과 공식 문서

## 범위
앱이 없어 기본 액션 전체 목록을 검증할 수 없습니다. 아래 8개 이름은 Elgato 공식 System Actions 문서에서 확인한 것이며, 설치 버전의 완전한 목록을 뜻하지 않습니다.

| 표시 이름 | 범주 | 문서상 기능/옵션 | 아이콘 | 컨트롤러/조건 |
|---|---|---|---|---|
| Open | System | 앱·파일·폴더 열기, 선택 또는 드래그 앤 드롭 | 미확인 | 키 흐름 문서; 다이얼 미확인 |
| Open Application | System | 앱 검색/실행; 길게 누를 때 close, force close, no-op 옵션(7.0 문서) | 미확인 | 키; 다이얼 미확인 |
| Close | System | 실행 중 앱 닫기, 앱 선택/드래그 | 미확인 | 키; 다이얼 미확인 |
| Website | System | URL/URI 열기; background GET 언급 | 미확인 | 키; 다이얼 미확인 |
| Hotkey Switch | System | 두 단축키 간 전환 | 미확인 | 키; 다이얼 미확인 |
| Hotkey | System | 단축키 조합, 7.0에서 Copy/Paste/Screenshot 등 프리셋 | 미확인 | 공식 Stream Deck + 도움말은 press/tap 및 시계·반시계 회전 사용을 설명 |
| Text | System | 미리 지정한 텍스트, Enter 추가, simulated typing/copy-paste 모드 | 미확인 | 키; 다이얼 미확인 |
| Multimedia | System | Previous Track, Play/Pause, Next Track, Stop, Mute, Increase/Decrease Volume | 문서에 명령별 아이콘이 있다고만 함 | 키; 다이얼 미확인 |

아이콘 모양은 자료가 구체화하지 않아 모두 미확인입니다. 다이얼 미확인은 미지원 판정이 아닙니다.
문서에서 Play Audio가 SoundBoard 범주에 나오나 기본 내장인지 외부/추가 구성인지 여기서 확정할 수 없어 별도 미확인으로 둡니다. 설치 플러그인과 기본 기능을 혼합하지 않았습니다.
Multi Action, Key Logic, Dial Stack은 복합 기능/액션으로 문서에 나타나나, 현 앱의 전체 목록과 Inspector는 미확인입니다.

출처:
- https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia
- https://help.elgato.com/hc/en-us/articles/10870947641741-Elgato-Stream-Deck-Hotkeys
- https://help.elgato.com/hc/en-us/articles/38011940576273-Elgato-Stream-Deck-7-0-Release-Notes
- https://help.elgato.com/hc/en-us/articles/4402425921165-Elgato-Stream-Deck-Download-and-use-Sound-Effects-Sounds

