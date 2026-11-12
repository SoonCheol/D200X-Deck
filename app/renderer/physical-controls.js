'use strict';

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
  const fields = [
    ['physical-side-left', 'sideLeft', sideOptions],
    ['physical-side-right', 'sideRight', sideOptions],
    ['physical-knob-1', 'knob1', knobOptions],
    ['physical-knob-2', 'knob2', knobOptions],
    ['physical-knob-3', 'knob3', knobOptions],
    ['physical-knob-1-press', 'knob1Press', sideOptions],
    ['physical-knob-2-press', 'knob2Press', sideOptions],
    ['physical-knob-3-press', 'knob3Press', sideOptions],
  ];
  const allowed = Object.fromEntries(fields.map(([,key, options]) => [key, new Set(options.map(([value]) => value))]));

  function configured(name) {
    const userValue = state.config?.settings?.physicalControls?.[name];
    return allowed[name].has(userValue) ? userValue : defaults[name];
  }
  function sync() {
    for (const [id, key] of fields) {
      const el = document.getElementById(id);
      if (el) el.value = configured(key);
    }
  }
  function setup() {
    for (const [id, key, options] of fields) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.replaceChildren();
      for (const [value, label] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        el.appendChild(option);
      }
      el.addEventListener('change', () => {
        if (!state.config?.settings || !allowed[key].has(el.value)) return;
        state.config.settings.physicalControls = {
          ...(state.config.settings.physicalControls || {}),
          [key]: el.value,
        };
        commit(false);
      });
    }
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
  // app.js initialises state asynchronously; defer initial value sync until
  // config loads, while keeping change handlers available immediately.
  setup();
  const originalSync = window.D200XPhysicalControls.sync;
  window.D200XPhysicalControls.sync = originalSync;
})();
