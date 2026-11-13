'use strict';
/* global WIDE_KEY_INDEX, toast, activePage, isPinnedSlot, state, renderGrid, renderInspector, $ */

// OpenDeck-inspired searchable action catalog for the D200X UI.
// This is a new implementation using the app's existing action editor.
(function () {
  const groups = [
    ['기본', [
      ['none', '동작 없음'],
    ]],
    ['프로그램과 웹', [
      ['app', '프로그램 실행'],
      ['url', '웹 주소 열기'],
      ['close', '프로그램 종료'],
    ]],
    ['미디어 제어', [
      ['media:playpause', '재생 / 일시정지'],
      ['media:next', '다음 곡'],
      ['media:prev', '이전 곡'],
      ['media:volumeup', '볼륨 높이기'],
      ['media:volumedown', '볼륨 낮추기'],
      ['media:mute', '음소거'],
      ['sound', '오디오 재생'],
    ]],
    ['시스템 입력', [
      ['hotkey', '단축키 보내기'],
      ['text', '문자 입력'],
      ['command', '명령 실행'],
    ]],
    ['페이지와 장치', [
      ['page', '페이지 전환'],
      ['indicator', '페이지 표시'],
      ['brightness', 'D200X 밝기'],
      ['timer', '타이머'],
      ['pop', '팝업 메뉴'],
      ['multi', '다중 동작'],
      ['toggle', '동작 전환'],
    ]],
    ['플러그인', [
      ['plugin', '플러그인 동작'],
    ]],
  ];

  function applyAction(actionId, index) {
    if (!Number.isInteger(index) || index < 0 || index >= WIDE_KEY_INDEX) {
      toast('먼저 D200X의 일반 버튼을 선택하세요.', true);
      return;
    }
    const page = activePage();
    if (!page || isPinnedSlot(page, index)) {
      toast('고정된 버튼은 먼저 고정을 해제하세요.', true);
      return;
    }
    // Reuse the original editor change event; it initialises action defaults,
    // metadata, save/push behaviour, and plugin instance IDs.
    state.selected = index;
    renderGrid();
    renderInspector();
    const typeSelect = $('#insp-action-type');
    if (!typeSelect) return;
    const [type, op] = actionId.split(':');
    typeSelect.value = type;
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    if (op) {
      const operation = $('#insp-value');
      if (operation && operation.tagName === 'SELECT') {
        operation.value = op;
        operation.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    $('#inspector')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render(query) {
    const root = document.querySelector('#action-library-list');
    if (!root) return;
    const term = String(query || '').trim().toLocaleLowerCase();
    root.replaceChildren();
    for (const [groupName, actions] of groups) {
      const matching = actions.filter(([id, label]) =>
        !term || label.toLocaleLowerCase().includes(term) ||
        groupName.toLocaleLowerCase().includes(term) || id.includes(term)
      );
      if (!matching.length) continue;
      const section = document.createElement('section');
      section.className = 'action-library-group';
      const heading = document.createElement('div');
      heading.className = 'action-library-group-name';
      heading.textContent = groupName;
      section.appendChild(heading);
      for (const [id, label] of matching) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-library-item';
        btn.textContent = label;
        btn.title = label + ' — 클릭하거나 버튼에 끌어 놓기';
        btn.draggable = true;
        btn.dataset.actionId = id;
        btn.addEventListener('click', () => applyAction(id, state.selected));
        btn.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-d200x-action', id);
          e.dataTransfer.effectAllowed = 'copy';
        });
        section.appendChild(btn);
      }
      root.appendChild(section);
    }
    if (!root.children.length) {
      const msg = document.createElement('div');
      msg.className = 'action-library-empty';
      msg.textContent = '검색 결과가 없습니다.';
      root.appendChild(msg);
    }
  }

  window.D200XActionCatalog = { applyAction };
  const search = document.querySelector('#action-library-search');
  if (search) {
    search.addEventListener('input', () => render(search.value));
    render('');
  }
})();
