'use strict';
/* global state, commit, navigateHome, navigateBack, navigateRelative, runKeyAction, runBrightnessAction, noteActivity */

// Configurable D200X physical side buttons and three rotary/push encoders.
// 15/16 = side buttons; 17/18/19 = encoders (state 1 push, 2 left, 3 right).
(function () {
  const sideOptions = [
    ['none', '동작 없음'],
    ['home', '첫 페이지'],
    ['back', '이전 페이지로 돌아가기'],
    ['nextPage', '다음 페이지'],
    ['prevPage', '이전 페이지'],
    ['playpause', '재생 / 일시정지'],
    ['nextTrack', '다음 곡'],
    ['prevTrack', '이전 곡'],
    ['mute', '음소거'],
  ];
  const knobOptions = [
    ['none', '동작 없음'],
    ['pages', '페이지 이전 / 다음'],
    ['volume', '볼륨 낮춤 / 높임'],
    ['tracks', '이전 곡 / 다음 곡'],
    ['brightness', '밝기 낮춤 / 높임'],
  ];
  const defaults = {
    sideLeft: 'home',
    sideRight: 'back',
    knob1: 'none',
    knob2: 'none',
    knob3: 'pages',
    knob1Press: 'none',
    knob2Press: 'none',
    knob3Press: 'none',
  };
  const allowed = {
    sideLeft: new Set(sideOptions.map(([value]) => value)),
    sideRight: new Set(sideOptions.map(([value]) => value)),
    ...Object.fromEntries([1, 2, 3].flatMap((number) => [
      ['knob' + number, new Set(knobOptions.map(([value]) => value))],
      ['knob' + number + 'Press', new Set(sideOptions.map(([value]) => value))],
    ])),
  };
  const knobNames = { knob1: '노브 1', knob2: '노브 2', knob3: '노브 3' };
  const shortLabel = {
    none: '미지정',
    home: '첫 페이지',
    back: '뒤로 가기',
    nextPage: '다음 페이지',
    prevPage: '이전 페이지',
    playpause: '재생/정지',
    nextTrack: '다음 곡',
    prevTrack: '이전 곡',
    mute: '음소거',
    pages: '페이지 이동',
    volume: '볼륨 조절',
    tracks: '곡 이동',
    brightness: '밝기 조절',
  };
  let selectedControl = null;

  function configured(name) {
    const userValue = state.config?.settings?.physicalControls?.[name];
    return allowed[name]?.has(userValue) ? userValue : defaults[name];
  }

  function renderLabels() {
    for (const name of ['sideLeft', 'sideRight', 'knob1', 'knob2', 'knob3']) {
      const label = document.querySelector('[data-action-label="' + name + '"]');
      if (label) label.textContent = shortLabel[configured(name)] || '미지정';
      if (!name.startsWith('knob')) continue;
      const pressLabel = document.querySelector('[data-press-label="' + name + '"]');
      if (pressLabel) pressLabel.textContent = '누름: ' +
        (shortLabel[configured(name + 'Press')] || '미지정');
    }
  }

  function fillOptions(el, options) {
    el.replaceChildren();
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      el.appendChild(option);
    }
  }

  function showEditor(name) {
    if (!allowed[name]) return;
    selectedControl = name;
    const isKnob = name.startsWith('knob');
    const editor = document.getElementById('physical-editor');
    const action = document.getElementById('physical-action-select');
    const press = document.getElementById('physical-press-select');
    const pressField = document.getElementById('physical-press-field');
    const heading = document.getElementById('physical-editor-title');
    heading.textContent = isKnob
      ? knobNames[name] + ' · 회전 / 누름 설정'
      : (name === 'sideLeft' ? '왼쪽' : '오른쪽') + ' 물리 버튼 설정';
    fillOptions(action, isKnob ? knobOptions : sideOptions);
    action.value = configured(name);
    pressField.hidden = !isKnob;
    if (isKnob) {
      fillOptions(press, sideOptions);
      press.value = configured(name + 'Press');
    }
    for (const button of document.querySelectorAll('[data-physical]')) {
      button.classList.toggle('selected', button.dataset.physical === name);
    }
    editor.hidden = false;
  }

  function closeEditor() {
    selectedControl = null;
    document.getElementById('physical-editor').hidden = true;
    for (const button of document.querySelectorAll('[data-physical]')) {
      button.classList.remove('selected');
    }
  }

  function saveSetting(name, value) {
    if (!state.config?.settings || !allowed[name]?.has(value)) return;
    state.config.settings.physicalControls = {
      ...(state.config.settings.physicalControls || {}),
      [name]: value,
    };
    commit(false);
    renderLabels();
  }

  function sync() {
    renderLabels();
    if (selectedControl) showEditor(selectedControl);
  }

  function setup() {
    for (const button of document.querySelectorAll('[data-physical]')) {
      button.addEventListener('click', () => showEditor(button.dataset.physical));
    }
    document.getElementById('physical-editor-close')
      .addEventListener('click', closeEditor);
    document.getElementById('physical-action-select').addEventListener('change', (event) => {
      if (selectedControl) saveSetting(selectedControl, event.target.value);
    });
    document.getElementById('physical-press-select').addEventListener('change', (event) => {
      if (selectedControl?.startsWith('knob')) {
        saveSetting(selectedControl + 'Press', event.target.value);
      }
    });
    sync();
  }

  function activate(operation) {
    if (operation === 'none') return;
    if (operation === 'home') return navigateHome();
    if (operation === 'back') return navigateBack();
    if (operation === 'nextPage') return navigateRelative(1);
    if (operation === 'prevPage') return navigateRelative(-1);
    const media = {
      playpause: 'playpause',
      nextTrack: 'next',
      prevTrack: 'prev',
      mute: 'mute',
    }[operation];
    if (media) runKeyAction({ type: 'media', op: media });
  }

  function rotate(mode, stateCode) {
    const left = stateCode === 2;
    if (mode === 'none') return;
    if (mode === 'pages') return navigateRelative(left ? -1 : 1);
    if (mode === 'tracks') {
      runKeyAction({ type: 'media', op: left ? 'prev' : 'next' });
      return;
    }
    if (mode === 'volume') {
      runKeyAction({ type: 'media', op: left ? 'volumedown' : 'volumeup' });
      return;
    }
    if (mode === 'brightness') {
      runBrightnessAction({ type: 'brightness', op: left ? 'down' : 'up', step: 5 });
    }
  }

  function handle(index, pressed, dialState) {
    if (index === 15 || index === 16) {
      if (pressed) activate(configured(index === 15 ? 'sideLeft' : 'sideRight'));
      return true;
    }
    if (index < 17 || index > 19) return false;
    const knob = index - 16;
    if (dialState === 2 || dialState === 3) {
      if (typeof noteActivity === 'function') noteActivity();
      rotate(configured('knob' + knob), dialState);
    } else if (pressed) {
      activate(configured('knob' + knob + 'Press'));
    }
    return true;
  }

  window.D200XPhysicalControls = { handle, sync };
  // app.js invokes sync again after loading the saved configuration.
  setup();
})();
