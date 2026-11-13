'use strict';

/* global activePage, state, WIDE_KEY_INDEX, isPinnedSlot, renderGrid, renderInspector,
   copySelectedKey, pasteKeyIntoSelection, clearSelectedKey, keyAt, addSubpage,
   commit, runKeyAction, toast */

// Stream Deck-like key context menu. All operations reuse existing editor paths.
// Event delegation survives renderGrid() replacing individual key elements.
(() => {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const menu = document.createElement('div');
  menu.id = 'sd-key-context-menu';
  menu.className = 'sd-key-context-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let previouslyFocused = null;

  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }
  function addItem(label, action, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', () => {
      close();
      action();
    });
    menu.append(button);
    return button;
  }
  function separator() {
    const line = document.createElement('div');
    line.className = 'sd-key-menu-separator';
    line.setAttribute('role', 'separator');
    menu.append(line);
  }
  function assign(type, extra = {}) {
    const page = activePage();
    if (!page || state.selected === WIDE_KEY_INDEX ||
        isPinnedSlot(page, state.selected)) return;
    const key = page.keys[state.selected] || {
      emoji: '', label: '', color: '#1b2130', icon: null,
      action: { type: 'none', value: '' },
    };
    key.action = { type, ...extra };
    page.keys[state.selected] = key;
    commit();
    renderGrid();
    renderInspector();
  }

  grid.addEventListener('contextmenu', (event) => {
    const tile = event.target.closest('.key[data-index]');
    if (!tile || !grid.contains(tile)) return;
    event.preventDefault();
    close();
    const index = Number(tile.dataset.index);
    const page = activePage();
    if (!page || !Number.isInteger(index)) return;
    state.selected = index;
    renderGrid();
    renderInspector();
    previouslyFocused = document.activeElement;
    const wide = index === WIDE_KEY_INDEX;
    const key = keyAt(page, index);
    const assigned = Boolean(key?.action && key.action.type !== 'none');
    const pinned = isPinnedSlot(page, index);

    if (wide) {
      addItem('와이드 키 설정', () => renderInspector());
    } else if (!assigned) {
      addItem('폴더 생성', () => addSubpage(page));
      addItem('다중 동작 생성', () => assign('multi', { mode: 'sequence', steps: [] }), pinned);
      addItem('동작 전환 생성', () => assign('toggle'), pinned);
      separator();
      addItem('복사', copySelectedKey, !key);
      addItem('붙여넣기 (Ctrl+V)', pasteKeyIntoSelection, pinned);
      addItem('속성 편집', () => renderInspector());
    } else {
      addItem('동작 시험', async () => {
        // Testing a system action separates editor/Windows dispatch issues
        // from missing or mismatched physical USB key events.
        const result = await runKeyAction(key.action, { pageId: page.id, index, field: 'action' });
        if (result?.ok) toast('동작 실행 요청 완료 (실제 효과는 별도 확인)');
      });
      separator();
      addItem('복사 (Ctrl+C)', copySelectedKey);
      addItem('붙여넣기 (Ctrl+V)', pasteKeyIntoSelection, pinned);
      addItem('속성 편집', () => renderInspector());
      separator();
      addItem('버튼 지우기 (Delete)', clearSelectedKey, pinned);
    }
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(5, Math.min(event.clientX, innerWidth - rect.width - 6)) + 'px';
    menu.style.top = Math.max(5, Math.min(event.clientY, innerHeight - rect.height - 6)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (menu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = buttons.indexOf(document.activeElement);
      buttons[(i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  });
  window.addEventListener('blur', close);
})();
