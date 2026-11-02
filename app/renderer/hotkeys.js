'use strict';

// --------------------------------------------------------------- hotkeys

const HOTKEY_MODS = [
  { token: 'cmd', label: '⌘ Command', symbol: '⌘' },
  { token: 'ctrl', label: '⌃ Control', symbol: '⌃' },
  { token: 'alt', label: '⌥ Option', symbol: '⌥' },
  { token: 'shift', label: '⇧ Shift', symbol: '⇧' },
];

const HOTKEY_GLYPHS = {
  cmd: '⌘', command: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧',
  return: '↩', enter: '↩', space: 'Space', tab: '⇥', escape: 'Esc', esc: 'Esc',
  delete: '⌫', backspace: '⌫', left: '←', right: '→', up: '↑', down: '↓',
};

/** "cmd+shift+4" → "⌘ ⇧ 4" */
function prettyHotkey(value) {
  return String(value || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => HOTKEY_GLYPHS[part.toLowerCase()] || part.toUpperCase())
    .join(' ');
}

const HOTKEY_CATEGORIES = [
  { id: 'modifiers', name: 'Modifier Keys', keys: HOTKEY_MODS },
  {
    id: 'letters',
    name: 'Letters',
    keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ label: c, token: c.toLowerCase() })),
  },
  {
    id: 'numbers',
    name: 'Numbers/Symbols',
    keys: [...'0123456789', ',', '.', ';', "'", '`', '[', ']', '/', '\\', '-', '='].map((t) => ({
      label: t,
      token: t,
    })),
  },
  {
    id: 'function',
    name: 'Navigation & editing',
    keys: [
      { label: '←', token: 'left' },
      { label: '↑', token: 'up' },
      { label: '→', token: 'right' },
      { label: '↓', token: 'down' },
      { label: 'Space', token: 'space' },
      { label: 'Return', token: 'return' },
      { label: 'Tab', token: 'tab' },
      { label: 'Esc', token: 'escape' },
      { label: 'Delete', token: 'delete' },
      { label: 'Home', token: 'home' },
      { label: 'End', token: 'end' },
      { label: 'PgUp', token: 'pageup' },
      { label: 'PgDn', token: 'pagedown' },
    ],
  },
  {
    id: 'fkeys',
    name: 'F Keys',
    keys: Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, token: `f${i + 1}` })),
  },
  {
    id: 'numpad',
    name: 'Numeric Keypad',
    keys: [
      ...Array.from({ length: 10 }, (_, i) => ({ label: `Num ${i}`, token: `numpad${i}` })),
      { label: 'Num +', token: 'numpadplus' },
      { label: 'Num -', token: 'numpadminus' },
      { label: 'Num *', token: 'numpadmultiply' },
      { label: 'Num /', token: 'numpaddivide' },
      { label: 'Num .', token: 'numpaddecimal' },
      { label: 'Num Enter', token: 'numpadenter' },
      { label: 'Num Del', token: 'numpadclear' },
      { label: 'Num =', token: 'numpadequal' },
    ],
  },
];

let hotkeyTarget = null;
let hotkeyOnCommit = null;
let hotkeyCategory = 'modifiers';
let hotkeyMods = new Set();
let hotkeyKeyToken = '';
let hotkeyKeyLabel = '';
let hotkeyListener = null;

function canonicalMod(token) {
  const t = String(token || '').toLowerCase();
  if (t === 'cmd' || t === 'command' || t === 'meta') return 'cmd';
  if (t === 'ctrl' || t === 'control') return 'ctrl';
  if (t === 'alt' || t === 'option') return 'alt';
  if (t === 'shift') return 'shift';
  return null;
}

function hotkeyLabelFor(token) {
  for (const cat of HOTKEY_CATEGORIES) {
    const found = cat.keys.find((k) => k.token === token);
    if (found) return found.label;
  }
  if (!token) return '';
  return token.length === 1 ? token.toUpperCase() : token;
}

function hotkeyCategoryFor(token) {
  for (const cat of HOTKEY_CATEGORIES) {
    if (cat.keys.some((k) => k.token === token)) return cat.id;
  }
  return 'modifiers';
}

function openHotkeyModal(key, onCommit = null) {
  hotkeyTarget = key;
  hotkeyOnCommit = onCommit;
  hotkeyMods = new Set();
  hotkeyKeyToken = '';
  hotkeyKeyLabel = '';
  for (const part of String(key.action?.value || '').split('+').filter(Boolean)) {
    const mod = canonicalMod(part);
    if (mod) hotkeyMods.add(mod);
    else {
      hotkeyKeyToken = part;
      hotkeyKeyLabel = hotkeyLabelFor(part);
    }
  }
  hotkeyCategory = hotkeyKeyToken ? hotkeyCategoryFor(hotkeyKeyToken) : 'modifiers';
  renderHotkeyModal();
  $('#hotkey-modal').classList.remove('hidden');
  hotkeyListener = (e) => handleHotkeyKey(e);
  document.addEventListener('keydown', hotkeyListener, true);
}

function closeHotkeyModal() {
  if (hotkeyListener) document.removeEventListener('keydown', hotkeyListener, true);
  hotkeyListener = null;
  hotkeyTarget = null;
  hotkeyOnCommit = null;
  $('#hotkey-modal').classList.add('hidden');
}

function hotkeyCombo() {
  if (!hotkeyKeyToken) return '';
  const mods = ['cmd', 'ctrl', 'alt', 'shift'].filter((m) => hotkeyMods.has(m));
  return [...mods, hotkeyKeyToken].join('+');
}

function renderHotkeyModal() {
  const display = $('#hotkey-display');
  const chips = [];
  for (const mod of HOTKEY_MODS) {
    if (hotkeyMods.has(mod.token)) chips.push(`<span class="hotkey-chip">${mod.symbol}</span>`);
  }
  if (hotkeyKeyToken) {
    chips.push(`<span class="hotkey-chip">${esc(hotkeyKeyLabel || hotkeyKeyToken)}</span>`);
  }
  display.innerHTML = chips.length ? chips.join('') : 'Press a button or add one below';

  const cats = $('#hotkey-cats');
  cats.innerHTML = HOTKEY_CATEGORIES.map(
    (cat) =>
      `<button class="hotkey-cat${cat.id === hotkeyCategory ? ' active' : ''}" data-cat="${cat.id}">${cat.name}</button>`
  ).join('');
  cats.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hotkeyCategory = btn.dataset.cat;
      renderHotkeyModal();
    });
  });

  const keys = $('#hotkey-keys');
  const cat = HOTKEY_CATEGORIES.find((c) => c.id === hotkeyCategory) || HOTKEY_CATEGORIES[0];
  keys.classList.toggle('modifier-grid', cat.id === 'modifiers');
  keys.innerHTML = cat.keys
    .map((key) => {
      const active =
        cat.id === 'modifiers' ? hotkeyMods.has(key.token) : hotkeyKeyToken === key.token;
      return `<button class="hotkey-key${active ? ' active' : ''}" data-token="${esc(key.token)}" data-label="${esc(
        key.label
      )}">${esc(key.label)}</button>`;
    })
    .join('');
  keys.querySelectorAll('.hotkey-key').forEach((btn) => {
    btn.addEventListener('click', () => {
      const token = btn.dataset.token;
      if (cat.id === 'modifiers') {
        if (hotkeyMods.has(token)) hotkeyMods.delete(token);
        else hotkeyMods.add(token);
      } else {
        hotkeyKeyToken = token;
        hotkeyKeyLabel = btn.dataset.label;
      }
      renderHotkeyModal();
    });
  });
}

function physicalKeyToken(e) {
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toLowerCase();
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `numpad${code.slice(6)}`;
  const numpad = {
    NumpadAdd: 'numpadplus',
    NumpadSubtract: 'numpadminus',
    NumpadMultiply: 'numpadmultiply',
    NumpadDivide: 'numpaddivide',
    NumpadDecimal: 'numpaddecimal',
    NumpadEnter: 'numpadenter',
    NumpadEqual: 'numpadequal',
  };
  if (numpad[code]) return numpad[code];
  const map = {
    ArrowLeft: 'left',
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ' ': 'space',
    Enter: 'return',
    Tab: 'tab',
    Backspace: 'delete',
    Delete: 'delete',
    Home: 'home',
    End: 'end',
    PageUp: 'pageup',
    PageDown: 'pagedown',
  };
  if (map[e.key]) return map[e.key];
  if (map[e.code]) return map[e.code];
  const symbols = { '-': '-', '=': '=', '[': '[', ']': ']', '\\': '\\', ';': ';', "'": "'", '`': '`', ',': ',', '.': '.', '/': '/' };
  if (symbols[e.key]) return symbols[e.key];
  return '';
}

function handleHotkeyKey(e) {
  if ($('#hotkey-modal').classList.contains('hidden')) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    closeHotkeyModal();
    return;
  }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
    hotkeyMods = new Set();
    if (e.metaKey) hotkeyMods.add('cmd');
    if (e.ctrlKey) hotkeyMods.add('ctrl');
    if (e.altKey) hotkeyMods.add('alt');
    if (e.shiftKey) hotkeyMods.add('shift');
    renderHotkeyModal();
    return;
  }
  hotkeyMods = new Set();
  if (e.metaKey) hotkeyMods.add('cmd');
  if (e.ctrlKey) hotkeyMods.add('ctrl');
  if (e.altKey) hotkeyMods.add('alt');
  if (e.shiftKey) hotkeyMods.add('shift');
  const token = physicalKeyToken(e);
  if (token) {
    hotkeyKeyToken = token;
    hotkeyKeyLabel = hotkeyLabelFor(token);
    hotkeyCategory = hotkeyCategoryFor(token);
    renderHotkeyModal();
  }
}

function saveHotkey() {
  if (!hotkeyTarget) return closeHotkeyModal();
  if (!hotkeyKeyToken) return toast('Choose a key first', true);
  hotkeyTarget.action = { ...hotkeyTarget.action, value: hotkeyCombo() };
  const onCommit = hotkeyOnCommit;
  const target = hotkeyTarget;
  commit();
  closeHotkeyModal();
  if (onCommit) onCommit(target.action);
  else renderInspector();
}

