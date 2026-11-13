# 05. 액션 조작 흐름

## 설치 후 관찰

1. 검색에 타이머를 입력하면 Stream Deck 범주에서 타이머만 남는다. 검색 (로컬 캡처)
2. 항목을 빈 키로 끌어 놓고 키를 선택하면 타이머가 배치되며 아래 속성 영역에서 제목·지속·사운드와 아이콘 컨트롤을 볼 수 있다. 속성 (로컬 캡처)
3. 키를 우클릭하고 삭제를 선택하면 확인 대화상자가 나타난다. 삭제를 눌러 조사 중 추가한 타이머를 제거하고 검색을 지웠다. 빈 키 복원 (로컬 캡처)

프로필 관리 화면 및 폴더·다중 동작 생성 메뉴까지 확인했다. 제목·아이콘 변경 적용, 프로필 전환과 폴더·다중 동작 내부 편집은 이 단계에서 확인하지 못했다.

## 초기 조사 기록과 공식 문서

아래는 공식 도움말에 적힌 흐름이며 현재 앱을 직접 조작한 기록은 아닙니다.

## 액션 등록과 편집
1. 오른쪽 액션 목록에서 항목을 찾습니다.
2. 원하는 키 슬롯으로 드래그합니다.
3. 선택된 액션의 Property Inspector에서 설정을 조정합니다.
4. 예: Hotkey는 키 조합, Text는 텍스트와 입력 모드, Website는 URL/URI를 설정합니다.
5. 저장 방식은 action Inspector 구현마다 다를 수 있습니다. SDK는 자동 저장, 유효성 피드백 등을 권장하지만 UI의 실제 저장 버튼 유무는 미확인입니다.

## Multi Action
1. 빈 키를 우클릭해 Create Multi Action을 선택하거나 액션 목록의 Multi Action을 빈 키로 드래그합니다.
2. 안에 실행할 액션을 배치합니다.
3. 문서는 각 액션의 Virtual Key Press 및 Next Action 지연을 조절하는 설정을 설명합니다.
4. 재정렬·복제·삭제의 현재 UI 동작은 미확인입니다.
출처: https://help.elgato.com/hc/en-us/articles/7092527123725-Elgato-Stream-Deck-Customizable-Multi-Action-Delays

## Key Logic
Stream Deck 7.0 문서는 빈 키 우클릭 또는 Multi Action 범주에서 추가하고 Press, Double press, Press and hold에 서로 다른 동작을 연결하는 기능을 설명합니다. 현재 화면은 미확인입니다.
출처: https://help.elgato.com/hc/en-us/articles/38011940576273-Elgato-Stream-Deck-7-0-Release-Notes

## 프로필 백업
1. Preferences(기어)를 엽니다.
2. Profiles 탭으로 이동합니다.
3. 우측 하단 화살표 → Backup All → Create Backup을 선택합니다.
4. 저장 위치와 파일명을 선택합니다.
출처: https://help.elgato.com/hc/en-us/articles/360048424432-Elgato-Stream-Deck-How-to-Back-Up-and-Restore-Profiles

폴더 생성/삭제, 프로필 전환·연결, 액션 수정·삭제, 제목·아이콘 수정, 플러그인 설치/설정은 실제 조작 단계 미확인입니다. SDK의 Property Inspector 설명은 action 설정 모델을 뒷받침할 뿐 클릭 순서의 증거가 아닙니다.

