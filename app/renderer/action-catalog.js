'use strict';
/* global WIDE_KEY_INDEX, toast, activePage, isPinnedSlot, state, renderGrid, renderInspector, $, commit, addSubpage, uuid */

/* Stream Deck 7.6.1 Key-tab inventory, based on the locally observed
 * 24-action list preserved in research/streamdeck/7.6.1/desktop/04-action-inventory.md.
 * This list is intentionally separate from installed plugins. */
(() => {
  const groups = [["Soundboard",[["sound:play","오디오 재생","sound"],["sound:stop","오디오 정지","sound-stop"]]],["Stream Deck",[["timer","타이머","timer"],["brightness","밝기","brightness"],["sleep","잠자기","sleep"],["virtual-toggle","Virtual Stream Deck 토글","virtual"]]],["다중 동작",[["multi:sequence","다중 동작","multi"],["multi:alternate","다중 동작 스위치","multi-switch"],["multi:random","무작위 동작","multi-random"],["key-logic","Key Logic","logic"]]],["시스템",[["url","웹사이트","url"],["hotkey-switch","단축키 전환","switch"],["hotkey","단축키","hotkey"],["open","열기","open"],["app","응용 프로그램 열기","app"],["close","닫기","close"],["text","텍스트","text"],["media","멀티미디어","media"]]],["탐색",[["folder","폴더 생성","folder"],["page:profile","프로필 전환","profile"],["page:prev","이전 페이지","prev"],["page:next","다음 페이지","next"],["page:goto","페이지로 이동","goto"],["indicator","페이지 표시기","indicator"]]]];
  const shapes = {"sound":"M4 9h4l5-4v14l-5-4H4z M17 8c3 2 3 6 0 8 M19 5c5 4 5 10 0 14","sound-stop":"M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6","timer":"M9 2h6 M12 6v6l4 2 M19 6l2-2 M12 22a9 9 0 1 0 0-18a9 9 0 0 0 0 18","brightness":"M12 4v-2 M12 22v-2 M4 12H2 M22 12h-2 M6 6 4.5 4.5 M19.5 19.5 18 18 M18 6l1.5-1.5 M4.5 19.5 6 18 M12 17a5 5 0 1 0 0-10a5 5 0 0 0 0 10","sleep":"M20 15a8 8 0 0 1-11-11a8 8 0 1 0 11 11z M16 3v4 M14 5h4","virtual":"M3 4h18v13H3z M9 21h6 M12 17v4 M8 8h3v3H8z M13 8h3v3h-3z","multi":"M3 12l6-6 6 6-6 6z M9 12l6-6 6 6-6 6","multi-switch":"M3 9l4-4 4 4-4 4z M13 9l4-4 4 4-4 4z M4 19h14 M15 16l3 3-3 3","multi-random":"M3 5c4 0 5 14 11 14h6 M17 16l3 3-3 3 M3 19c4 0 5-14 11-14h6 M17 2l3 3-3 3","logic":"M8 3v4 M16 3v4 M5 9h14 M7 12v3 M12 12v6 M17 12v3 M4 20h16v-12H4z","url":"M10 3a9 9 0 1 0 4 18 M3 12h18 M12 3c4 4 4 14 0 18 M12 3c-3 4-3 14 0 18 M16 6l5-3 M21 3v5","switch":"M4 7h14l-3-3 M18 7l-3 3 M20 17H6l3-3 M6 17l3 3","hotkey":"M3 5h18v14H3z M6 9h2 M11 9h2 M16 9h2 M6 13h2 M11 13h2 M16 13h2 M8 16h8","open":"M12 4h8v8 M20 4l-9 9 M18 14v6H4V6h7","app":"M4 4h16v16H4z M8 8h3v3H8z M13 8h3v3h-3z M8 13h3v3H8z M13 13h3v3h-3z","close":"M5 5h14v14H5z M9 9l6 6 M15 9l-6 6","text":"M4 5h16 M12 5v14 M8 19h8","media":"M4 7v10l8-5z M14 7v10 M18 7v10","folder":"M3 7h8l2 2h8v11H3z M12 12v6 M9 15h6","profile":"M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M4 21c0-8 16-8 16 0 M20 5v5 M17.5 7.5h5","prev":"M13 5l-7 7 7 7 M20 5l-7 7 7 7","next":"M11 5l7 7-7 7 M4 5l7 7-7 7","goto":"M4 5h16v14H4z M8 12h8 M13 9l3 3-3 3","indicator":"M5 12h1 M10 12h1 M15 12h1 M20 12h1 M3 5h18v14H3z"};
  const icon = (name) => {
    if (window.D200XElgatoIcons?.[name]) return window.D200XElgatoIcons[name];
    const path = shapes[name] || shapes.app;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
  };
  const unavailable = {
    sleep: 'D200X 장치 잠자기 동작은 아직 지원되지 않습니다.',
    'virtual-toggle': 'Virtual Stream Deck은 D200X 전용 편집기에서 아직 지원되지 않습니다.',
  };
  // Stream Deck's single Multimedia action has a selectable operation in
  // the lower inspector, not six extra entries in the action catalogue.
  function applyAction(id, index) {
    if (unavailable[id]) { toast(unavailable[id], true); return false; }
    if (!Number.isInteger(index) || index < 0 || index >= WIDE_KEY_INDEX) {
      toast('D200X의 일반 키를 먼저 선택하거나 동작을 끌어 놓으세요.', true);
      return false;
    }
    const page = activePage();
    if (!page || isPinnedSlot(page, index)) {
      toast('이 키는 현재 편집할 수 없습니다.', true);
      return false;
    }
    state.selected = index;
    if (id === 'folder') {
      // The target must be the *dropped key*, not nextFreeIndex(page).
      const child = { id: uuid(), name: '새 폴더', profileId: page.profileId, parentId: page.id, keys: {} };
      let num = 2;
      const exists = (name) => state.config.pages.some((p) => p.profileId === page.profileId && p.name === name);
      while (exists(child.name)) child.name = '새 폴더 ' + num++;
      child.keys[0] = { label: '뒤로', emoji: '', color: '#1b2130', icon: null,
        action: { type: 'page', op: 'back', value: '' } };
      state.config.pages.push(child);
      page.keys[index] = { label: child.name, emoji: '', color: '#1b2130', icon: null,
        action: { type: 'page', op: 'goto', value: child.id } };
      commit(); renderGrid(); renderInspector();
      return true;
    }
    const [base] = id.split(':');
    const mapped = {
      'hotkey-switch': 'toggle',
      'key-logic': 'none',
      open: 'app',
    };
    const type = mapped[id] || (base === 'sound' ? 'sound' : base === 'multi' ? 'multi' : base);
    renderGrid(); renderInspector();
    const select = $('#insp-action-type');
    if (!select) return false;
    select.value = type;
    if (select.value !== type) { toast('아직 등록할 수 없는 동작: ' + id, true); return false; }
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const key = page.keys[index];
    if (!key) return false;
    const op = id.slice(base.length + 1);
    if (base === 'sound') { key.action.op = op || 'play'; if (op === 'stop') key.action.value = 'default'; }
    if (base === 'multi') { key.action.mode = op || 'sequence'; key.action.steps = []; }
    if (base === 'page') {
      key.action.op = op || 'goto';
      if (op === 'profile') key.action.value = state.config.activeProfileId;
      if (op === 'next' || op === 'prev') key.action.value = '';
    }
    if (id === 'hotkey-switch') {
      key.action.steps = [{ action: { type: 'hotkey', value: '' } }, { action: { type: 'hotkey', value: '' } }];
    }
    if (id === 'key-logic') {
      // Press, double-press and hold are configured through the existing
      // trigger section; do not fabricate an unsupported standalone action.
      key.action = { type: 'none', value: '' };
      key.keyLogic = true;
      toast('아래 속성에서 누름·두 번 누름·길게 누름 동작을 설정하세요.');
    }
    if (id === 'open') {
      // Existing 'app' picker can open file paths, but this is not yet
      // identical to Stream Deck's generic Open Property Inspector.
      toast('열기 동작은 기존 프로그램/파일 선택기로 등록됩니다.');
    }
    if (id === 'timer') { key.action.seconds = 30; }
    commit(); renderGrid(); renderInspector();
    $('#inspector')?.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  const root = document.querySelector('#action-library-list');
  if (!root) return;
  const openGroups = new Set(groups.map(([name]) => name));
  function render(query = '') {
    const term = String(query).trim().toLocaleLowerCase();
    root.replaceChildren();
    for (const [category, items] of groups) {
      const matches = items.filter(([id, label]) =>
        !term || category.toLocaleLowerCase().includes(term) ||
        label.toLocaleLowerCase().includes(term) || id.includes(term));
      if (!matches.length) continue;
      const section = document.createElement('section');
      section.className = 'action-library-group';
      const heading = document.createElement('button');
      heading.type = 'button';
      heading.className = 'action-library-group-name';
      heading.setAttribute('aria-expanded', String(term ? true : openGroups.has(category)));
      heading.innerHTML = '<span class="sd-group-chevron">⌄</span><span class="sd-group-icon">' +
        icon(items[0][2]) + '</span><span>' + category + '</span>';
      const list = document.createElement('div');
      list.className = 'sd-action-group-items';
      list.hidden = !term && !openGroups.has(category);
      heading.addEventListener('click', () => {
        if (openGroups.has(category)) openGroups.delete(category);
        else openGroups.add(category);
        const expanded = openGroups.has(category);
        list.hidden = !expanded;
        heading.setAttribute('aria-expanded', String(expanded));
      });
      section.append(heading, list);
      for (const [id, label, iconName] of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'action-library-item';
        button.dataset.actionId = id;
        button.innerHTML = '<span class="sd-action-icon">' + icon(iconName) +
          '</span><span class="sd-action-name"></span>';
        button.querySelector('.sd-action-name').textContent = label;
        button.title = unavailable[id] || (label + ' — 키로 드래그하거나 키 선택 후 클릭');
        button.draggable = !unavailable[id];
        button.classList.toggle('sd-action-unavailable', Boolean(unavailable[id]));
        button.addEventListener('click', () => applyAction(id, state.selected));
        button.addEventListener('dragstart', (event) => {
          if (unavailable[id]) { event.preventDefault(); return; }
          event.dataTransfer.setData('application/x-d200x-action', id);
          event.dataTransfer.effectAllowed = 'copy';
        });
        list.append(button);
      }
    }
    if (!root.children.length) {
      const empty = document.createElement('p');
      empty.className = 'action-library-empty';
      empty.textContent = '검색 결과가 없습니다.';
      root.append(empty);
    }
  }
  window.D200XActionCatalog = { applyAction, groups };
  const search = document.querySelector('#action-library-search');
  search?.addEventListener('input', () => render(search.value));
  render(search?.value || '');
})();
