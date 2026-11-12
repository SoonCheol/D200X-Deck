'use strict';

// Korean display translation for the Windows fork.
// Exact-match UI text only: action IDs, stored values, plugin settings and
// user-created profile/key names are not translated or rewritten.
(() => {
  const translations = {
  "New profile…": "새 프로필…",
  "Profile settings…": "프로필 설정…",
  "Import profile…": "프로필 가져오기…",
  "Export profile…": "프로필 내보내기…",
  "Pages": "페이지",
  "Plugins & Icons": "플러그인 및 아이콘",
  "Installed": "설치됨",
  "Store": "스토어",
  "Looking for D200…": "D200 연결 검색 중…",
  "Disconnected": "연결 끊김",
  "Connected": "연결됨",
  "Deck": "기기",
  "Page settings": "페이지 설정",
  "Push to Deck": "기기에 전송",
  "Deck settings": "기기 설정",
  "Display": "화면",
  "Device": "장치",
  "App": "앱",
  "Brightness": "밝기",
  "Screen sleep": "화면 절전",
  "Apply": "적용",
  "Standby screen": "대기 화면",
  "Standby image": "대기 이미지",
  "None": "없음",
  "Choose…": "선택…",
  "Clear": "지우기",
  "On screen lock": "화면 잠금 시",
  "Show screensaver": "화면 보호기 표시",
  "Lock image": "잠금 이미지",
  "Auto-push changes": "변경 사항 자동 전송",
  "Reconnect Deck": "기기 다시 연결",
  "Launch at login": "로그인 시 실행",
  "Open in the menu bar": "작업 표시줄에서 실행",
  "Accessibility": "접근성",
  "Checking…": "확인 중…",
  "Grant…": "권한 허용…",
  "Key capture": "키 입력 캡처",
  "Version": "버전",
  "Check…": "확인…",
  "Release page": "릴리스 페이지",
  "Check for updates": "업데이트 확인",
  "On launch and periodically": "실행 시 및 주기적으로",
  "Check every": "확인 주기",
  "1 hour": "1시간",
  "6 hours": "6시간",
  "12 hours": "12시간",
  "24 hours": "24시간",
  "About": "정보",
  "About Ulanzi Deck Open…": "프로그램 정보…",
  "Reconnect": "다시 연결",
  "ready": "준비됨",
  "Add key combination": "키 조합 등록",
  "Press a combination, or pick keys below.": "키 조합을 누르거나 아래에서 선택하세요.",
  "Press the key combination or pick keys below.": "키 조합을 누르거나 아래에서 선택하세요.",
  "Cancel": "취소",
  "Save": "저장",
  "Choose an application": "프로그램 선택",
  "Installed applications and Windows executable files.": "설치된 프로그램 또는 Windows 실행 파일을 선택하세요.",
  "Browse EXE…": "EXE 파일 찾아보기…",
  "New profile": "새 프로필",
  "Profiles group pages. Keys can switch profiles.": "프로필은 페이지를 묶어 관리하며, 버튼으로 전환할 수 있습니다.",
  "Name": "이름",
  "Linked app": "연결된 프로그램",
  "No app": "연결된 프로그램 없음",
  "Background": "배경",
  "Delete profile": "프로필 삭제",
  "Save changes": "변경 사항 저장",
  "Import profile": "프로필 가져오기",
  "Mode": "방식",
  "Create a new profile": "새 프로필 만들기",
  "Add pages to the current profile": "현재 프로필에 페이지 추가",
  "Replace the current profile": "현재 프로필 교체",
  "Choose file…": "파일 선택…",
  "Import": "가져오기",
  "Icon library": "아이콘 라이브러리",
  "Install folder…": "폴더에서 설치…",
  "Install .zip…": "ZIP에서 설치…",
  "Sign out": "로그아웃",
  "Ulanzi Plugins": "Ulanzi 플러그인",
  "Ulanzi Icons": "Ulanzi 아이콘",
  "OpenAction Plugins": "OpenAction 플러그인",
  "Sign in": "로그인",
  "Popular": "인기순",
  "Top rated": "평점순",
  "Latest": "최신순",
  "Load more": "더 보기",
  "Refresh": "새로 고침",
  "Confirm": "확인",
  "Editing tips": "편집 도움말",
  "Fast ways to build a page.": "페이지를 빠르게 구성하는 방법",
  "Click a key to edit it.": "편집하려는 버튼을 클릭하세요.",
  "New subpage": "새 하위 페이지",
  "Pinned keys appear on every page of the profile.": "고정 버튼은 해당 프로필의 모든 페이지에 표시됩니다.",
  "Update available": "업데이트 있음",
  "Later": "나중에",
  "Open release page": "릴리스 페이지 열기",
  "Plugins": "플러그인",
  "Icons": "아이콘",
  "Reload all": "전체 새로고침",
  "Open plugins folder": "플러그인 폴더 열기",
  "Open Stream Deck folder": "Stream Deck 폴더 열기",
  "Open plugin log": "플러그인 로그 열기",
  "Get icon packs…": "아이콘 팩 받기…",
  "Open icons folder": "아이콘 폴더 열기",
  "Key text": "버튼 글자",
  "Icon": "아이콘",
  "File": "파일",
  "Library": "라이브러리",
  "Remove": "제거",
  "Custom": "사용자 지정",
  "Action": "동작",
  "Action type": "동작 유형",
  "Choose": "선택",
  "Select": "선택",
  "Close": "닫기",
  "No applications found.": "프로그램을 찾을 수 없습니다. EXE 파일 찾아보기를 이용하세요.",
  "No icon": "아이콘 없음",
  "Action icon": "동작 아이콘",
  "App icon": "프로그램 아이콘",
  "Favicon": "사이트 아이콘",
  "Reset": "초기화",
  "Text": "텍스트",
  "Font": "글꼴",
  "Weight": "굵기",
  "Light": "얇게",
  "Regular": "보통",
  "Bold": "굵게",
  "Key background": "버튼 배경",
  "Page": "페이지",
  "Page name": "페이지 이름",
  "Add page": "페이지 추가",
  "Duplicate page": "페이지 복제",
  "Delete page": "페이지 삭제",
  "Pinned keys": "고정 버튼",
  "Unpin": "고정 해제",
  "Pin": "고정",
  "Tips": "사용 도움말",
  "Go to page": "페이지로 이동",
  "Next page": "다음 페이지",
  "Previous page": "이전 페이지",
  "Back to parent page": "상위 페이지로 돌아가기",
  "Switch profile": "프로필 전환",
  "Play / pause": "재생 / 일시정지",
  "Next track": "다음 곡",
  "Previous track": "이전 곡",
  "Volume up": "볼륨 높이기",
  "Volume down": "볼륨 낮추기",
  "Mute": "음소거",
  "Do nothing": "동작 없음",
  "Open app": "프로그램 실행",
  "Open URL": "URL 열기",
  "Run shell command": "명령 실행",
  "Send hotkey": "단축키 전송",
  "Type text": "문자 입력",
  "Media key": "미디어키",
  "Close app": "프로그램 종료",
  "Switch to page": "페이지 전환",
  "Plugin action": "플러그인 동작",
  "Multi action": "다중 동작",
  "Toggle two actions": "두 동작 전환",
  "Page indicator": "페이지 표시",
  "Play audio": "오디오 재생",
  "Timer": "타이머",
  "Deck brightness": "기기 밝기",
  "POP menu": "팝업 메뉴",
  "Basic": "기본",
  "Device & pages": "기기 및 페이지",
  "Apps & links": "프로그램 및 링크",
  "System": "시스템",
  "Nothing": "동작 없음",
  "Key": "버튼",
  "Title": "제목",
  "Label": "레이블",
  "Settings": "설정",
  "Add": "추가",
  "Delete": "삭제",
  "Duplicate": "복제",
  "Test": "시험",
  "Set hotkey…": "단축키 설정…",
  "No applications found": "프로그램을 찾을 수 없습니다",
  "Loading…": "불러오는 중…",
  "No app selected": "선택된 프로그램 없음",
  "No plugins found.": "플러그인을 찾을 수 없습니다.",
  "No image": "이미지 없음",
  "Drag to reorder": "드래그하여 순서 변경",
  "Show command output on this key": "버튼에 명령 출력 표시",
  "Refresh every": "새로고침 주기",
  "seconds": "초",
  "Blank the Deck’s screen after this many seconds without key presses (0 = never). Any key wakes it.": "지정한 시간 동안 버튼을 누르지 않으면 화면이 꺼집니다. 0은 끄지 않음이며, 버튼을 누르면 다시 켜집니다.",
  "Show a clock (and optional wallpaper) when idle. The first press only wakes the Deck.": "대기 시 시계와 선택한 배경을 표시합니다. 처음 누르는 버튼은 화면만 깨웁니다.",
  "Shows the clock (and image) while the Mac is locked; the page returns on unlock.": "Windows 잠금 중에는 대기 화면을 표시하고, 잠금 해제 후 원래 페이지로 돌아옵니다.",
  "Accessibility is needed for hotkeys and typed text.": "단축키와 문자 입력에 필요한 권한 정보입니다.",
  "Connect your D200. If Ulanzi Studio is open, quit it.": "D200을 연결하세요. Ulanzi Studio 또는 OpenDeck이 실행 중이면 종료하세요.",
  "Click a key to edit · drag any image onto a key · ⌘S pushes": "버튼을 클릭해 편집 · 이미지를 끌어 놓아 아이콘 설정 · Ctrl+S로 기기에 전송",
  "Switch to this profile when the app is frontmost.": "이 프로그램이 활성화되면 해당 프로필로 자동 전환합니다.",
  "Used by every page in the profile unless the page has its own.": "페이지별 배경이 없으면 프로필의 모든 페이지에 적용됩니다.",
  "Pick a profile from Ulanzi Studio on this Mac, or choose a profile file (Ulanzi Studio or Deck Open).": "Ulanzi Studio 또는 Deck Open 프로필 파일을 선택하세요.",
  "Icon packs downloaded from the store.": "스토어에서 받은 아이콘 팩입니다.",
  "Ulanzi plugins and icons, plus OpenAction (Stream Deck-compatible) plugins.": "Ulanzi 플러그인·아이콘과 Stream Deck 호환 플러그인입니다.",
  "Drag any image onto a key to use it as the icon (scaled to 196×196).": "버튼에 이미지를 끌어 놓으면 196×196 아이콘으로 적용됩니다.",
  "Drag a page in the sidebar to reorder it, or press ⌥↑ / ⌥↓.": "왼쪽 페이지를 드래그하여 순서를 바꿀 수 있습니다.",
  "Press ⌘S to push the page to the Deck.": "Ctrl+S를 눌러 현재 페이지를 기기에 전송합니다.",
  "Click a key to edit it. Drag any image onto a key to use it as the icon (it is scaled to 196×196).": "버튼을 클릭하여 편집합니다. 이미지를 끌어 놓으면 196×196 아이콘으로 사용합니다.",
  "Search applications…": "프로그램 검색…",
  "Profile name": "프로필 이름",
  "Search plugins…": "플러그인 검색…",
  "Text or emoji": "텍스트 또는 이모지",
  "Choose an image file": "이미지 파일 선택",
  "Hide inspector": "편집 패널 숨기기",
  "Profile": "프로필",
  "Profile actions": "프로필 관리",
  "Close window": "창 닫기",
  "Page settings: name, parent page, background": "페이지 설정: 이름, 상위 페이지, 배경"
};
  const translate = (raw) => {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    if (!match) return raw;
    const value = translations[match[2]];
    return value === undefined ? raw : match[1] + value + match[3];
  };
  const attributes = ['title', 'placeholder', 'aria-label', 'label'];
  function localize(root) {
    const nodes = [root];
    if (root.nodeType === Node.ELEMENT_NODE) {
      nodes.push(...root.querySelectorAll('*'));
    }
    for (const el of nodes) {
      if (el.nodeType === Node.TEXT_NODE) {
        if (el.nodeValue) {
          const result = translate(el.nodeValue);
          if (result !== el.nodeValue) el.nodeValue = result;
        }
        continue;
      }
      if (el.nodeType !== Node.ELEMENT_NODE) continue;
      if (['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'].includes(el.tagName)) continue;
      for (const attr of attributes) {
        const current = el.getAttribute(attr);
        if (current !== null) {
          const result = translate(current);
          if (result !== current) el.setAttribute(attr, result);
        }
      }
      for (const child of el.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE) continue;
        const old = child.nodeValue;
        const result = translate(old);
        if (result !== old) child.nodeValue = result;
      }
    }
  }
  document.documentElement.lang = 'ko';
  localize(document.body);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'characterData') localize(change.target);
      else if (change.type === 'attributes') localize(change.target);
      else for (const node of change.addedNodes) localize(node);
    }
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: attributes,
  });
})();
