'use strict';

// -------------------------------------------------------------- key presses

const pressState = new Map();
const wakeSwallow = new Set();
// Physical switch bounce: the D200 can emit several press/release pairs for one
// tap. Ignore a second press inside this window (still below a deliberate
// double press, which the double-trigger window treats as two taps).
const lastDownAt = new Map();
const BOUNCE_MS = 150;
const DOUBLE_WINDOW = 300;

function navigateRelative(step) {
  const pages = state.config.pages.filter((p) => p.profileId === state.config.activeProfileId);
  if (pages.length < 2) return;
  const index = pages.findIndex((p) => p.id === state.config.activePageId);
  if (index < 0) return;
  const next = (index + step + pages.length) % pages.length;
  navigate(pages[next].id);
}

const multiState = new WeakMap(); // action object -> alternate index
let sequenceToken = 0;

// Running timers live in memory only (not in the config): key -> { endsAt, handle }.
const runningTimers = new Map();
const TIMER_SOUND = '/System/Library/Sounds/Glass.aiff';

function formatTimer(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function timerTextFor(action) {
  if (!action || action.type !== 'timer') return '';
  const timer = runningTimers.get(action);
  if (!timer) return '';
  return formatTimer((timer.endsAt - Date.now()) / 1000);
}

/** Find the slot showing this action on the active page (page key or pinned). */
function slotForAction(action) {
  const page = activePage();
  if (!page) return -1;
  for (const source of [page.keys, pinnedFor(page.profileId)]) {
    for (const [index, key] of Object.entries(source || {})) {
      if (key?.action === action) return Number(index);
    }
  }
  return -1;
}

function stopTimer(action, { beep = false } = {}) {
  const timer = runningTimers.get(action);
  if (!timer) return;
  clearInterval(timer.handle);
  runningTimers.delete(action);
  const index = slotForAction(action);
  if (index >= 0) {
    drawIndex(index);
    schedulePush();
  }
  if (beep) {
    if (action.sound !== false) {
      api.runAction({ type: 'command', value: `afplay ${TIMER_SOUND}` }).catch(() => {});
    }
    toast('Timer finished');
  }
}

function toggleTimer(action) {
  if (runningTimers.has(action)) {
    stopTimer(action);
    toast('Timer cancelled');
    return;
  }
  const seconds = Math.max(1, Number(action.seconds) || 300);
  const timer = { endsAt: Date.now() + seconds * 1000, handle: null, lastPush: 0 };
  const tick = () => {
    const left = timer.endsAt - Date.now();
    if (left <= 0) {
      stopTimer(action, { beep: true });
      return;
    }
    const index = slotForAction(action);
    if (index >= 0) {
      drawIndex(index);
      // A full page push is ~400 KB over HID, so refresh the deck every five
      // seconds; the on-screen countdown still ticks every second.
      if (Date.now() - timer.lastPush >= 5000) {
        timer.lastPush = Date.now();
        schedulePush();
      }
    }
  };
  timer.handle = setInterval(tick, 1000);
  runningTimers.set(action, timer);
  tick();
  toast(`Timer started — ${formatTimer(seconds)}`);
}

function runBrightnessAction(action) {
  const current = Number(state.config.settings.brightness) || 0;
  const step = Math.max(1, Number(action.step) || 5);
  const next = Math.max(0, Math.min(100, current + (action.op === 'down' ? -step : step)));
  state.config.settings.brightness = next;
  api.setBrightness(next);
  const slider = document.getElementById('brightness');
  if (slider) slider.value = String(next);
  const label = document.getElementById('brightness-value');
  if (label) label.textContent = String(next);
  commit(false);
  toast(`Brightness ${next}%`);
}

function popItem(action) {
  if (!action) return { label: '', emoji: '' };
  if (action.type === 'text') {
    const text = String(action.value || '').trim();
    const emoji = typeof isEmojiOnly === 'function' && isEmojiOnly(text) ? text : '';
    return { label: emoji ? '' : text || 'Type text', emoji };
  }
  const meta = typeof actionMeta === 'function' ? actionMeta(action) : {};
  const fallback = {
    app: ['📱', 'Open app'],
    url: ['🌐', 'Open URL'],
    hotkey: ['⌨️', 'Hotkey'],
    command: ['💻', 'Command'],
    media: ['🎵', 'Media'],
    page: ['📄', 'Page'],
    close: ['✖️', 'Close app'],
    sound: ['🔊', 'Audio'],
    plugin: ['🔌', 'Plugin'],
  }[action.type] || ['⚡', action.type];
  return { emoji: meta.emoji || fallback[0], label: meta.label || fallback[1] };
}

async function openPop(action) {
  const steps = (Array.isArray(action.steps) ? action.steps : [])
    .map((step) => step?.action)
    .filter((step) => step && step.type !== 'none');
  if (!steps.length) return toast('POP menu has no actions', true);
  const index = await api.showPop(steps.map(popItem));
  if (index >= 0 && steps[index]) runKeyAction(steps[index]);
}

function runKeyAction(action) {
  if (!action || action.type === 'none') return;
  if (action.type === 'indicator') return;
  if (action.type === 'pop') return openPop(action);
  if (action.type === 'timer') return toggleTimer(action);
  if (action.type === 'brightness') return runBrightnessAction(action);
  if (action.type === 'multi') return runMulti(action);
  if (action.type === 'toggle') return runToggle(action);
  if (action.type === 'page') {
    if (action.op === 'next') return navigateRelative(1);
    if (action.op === 'prev') return navigateRelative(-1);
    if (action.op === 'profile') {
      switchProfile(action.value);
      return;
    }
    if (action.op === 'back') {
      const parent = activePage().parentId;
      if (parent) return navigate(parent);
      return navigateRelative(-1);
    }
    navigate(action.value);
    return;
  }
  if (action.type === 'plugin') {
    api.runPluginAction(action.actionid).then((res) => {
      if (!res.ok) toast('Plugin action is not ready yet', true);
    });
    return;
  }
  api.runAction(action).then((res) => {
    if (res.ok) return;
    toast(res.error || 'action failed', true);
    if (res.permission === 'accessibility') api.requestAccessibility?.();
  });
}

/** Multi Action: sequence / alternate / random, with delay steps. */
async function runMulti(action) {
  const steps = Array.isArray(action.steps) ? action.steps : [];
  if (!steps.length) return;
  const token = ++sequenceToken;
  let order = steps.map((_, index) => index);
  if (action.mode === 'alternate') {
    const current = multiState.get(action) || 0;
    order = [steps.length ? current % steps.length : 0];
    multiState.set(action, (current + 1) % Math.max(1, steps.length));
  } else if (action.mode === 'random') {
    const last = multiState.get(action) ?? -1;
    let pick = Math.floor(Math.random() * steps.length);
    if (steps.length > 1 && pick === last) pick = (pick + 1) % steps.length;
    multiState.set(action, pick);
    order = [pick];
  }
  for (const index of order) {
    if (token !== sequenceToken) return; // a newer press cancelled this run
    const step = steps[index];
    if (!step) continue;
    if (step.delay) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(step.delay) || 0)));
      continue;
    }
    if (step.action) runKeyAction(step.action);
  }
}

/** Hotkey Switch: alternate between two actions on each press. */
function runToggle(action) {
  const steps = Array.isArray(action.steps) ? action.steps : [];
  if (!steps.length) return;
  const index = multiState.get(action) || 0;
  multiState.set(action, (index + 1) % steps.length);
  const step = steps[index % steps.length];
  if (step?.action) runKeyAction(step.action);
}

function flashKey(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  tile.classList.add('pressed');
  setTimeout(() => tile.classList.remove('pressed'), 160);
}

function handleKeyEvent(index, pressed) {
  // The wide key is a firmware system panel; never run actions for it
  // (proto 0x0e resets the deck to its factory profile).
  if (index === WIDE_KEY_INDEX) return;
  if (pressed) {
    const now = Date.now();
    if (now - (lastDownAt.get(index) || 0) < BOUNCE_MS) return;
    lastDownAt.set(index, now);
  }
  if (pressed && typeof noteActivity === 'function') noteActivity();
  // The first press while the standby screen is up only wakes the deck; its
  // release must not fire a tap/double action either.
  if (typeof standbyActive === 'function' && standbyActive()) {
    if (pressed) {
      wakeSwallow.add(index);
      exitStandby();
    }
    return;
  }
  if (!pressed && wakeSwallow.has(index)) {
    wakeSwallow.delete(index);
    return;
  }
  const key = keyAt(activePage(), index);
  if (!key) return;

  const hasHold = key.holdAction && key.holdAction.type !== 'none';
  const hasDouble = key.doubleAction && key.doubleAction.type !== 'none';
  if (!hasHold && !hasDouble) {
    if (pressed) {
      flashKey(index);
      runKeyAction(key.action);
    }
    return;
  }

  const st = pressState.get(index) || {};
  pressState.set(index, st);

  if (pressed) {
    const now = Date.now();
    if (st.lastDown && now - st.lastDown < 60) return; // key bounce / repeats
    st.lastDown = now;
    flashKey(index);

    if (st.tapTimer) {
      clearTimeout(st.tapTimer);
      st.tapTimer = null;
      if (hasDouble) {
        st.doubleFired = true;
        runKeyAction(key.doubleAction);
        return;
      }
    }
    st.held = false;
    if (hasHold) {
      st.holdTimer = setTimeout(() => {
        st.holdTimer = null;
        st.held = true;
        runKeyAction(key.holdAction);
      }, Math.max(150, Number(key.holdMs) || 500));
    }
    return;
  }

  if (st.holdTimer) {
    clearTimeout(st.holdTimer);
    st.holdTimer = null;
  }
  if (st.held) {
    st.held = false;
    return;
  }
  if (st.doubleFired) {
    st.doubleFired = false;
    return;
  }
  if (hasDouble) {
    st.tapTimer = setTimeout(() => {
      st.tapTimer = null;
      runKeyAction(key.action);
    }, DOUBLE_WINDOW);
  } else {
    runKeyAction(key.action);
  }
}

