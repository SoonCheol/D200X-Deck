'use strict';

/* global $, actionIconSrc, actionMeta, activePage, api, commit, drawIndex, exitStandby, isEmojiOnly, keyAt, lockActive, navigate, navigateBack, navigateHome, noteActivity, notePluginKeyPress, pinnedFor, pushNow, refreshCommandOutput, refreshWideStats, renderInspector, scheduleLivePush, scheduleSave, standbyActive, state, switchProfile, toast, WIDE_KEY_INDEX */

// -------------------------------------------------------------- key presses

const pressState = new Map();
const wakeSwallow = new Set();
// Physical switch bounce: the D200 can emit several press/release pairs for one
// tap. Ignore a second press inside this window (still below a deliberate
// double press, which the double-trigger window treats as two taps).
const lastDownAt = new Map();
const BOUNCE_MS = 60;
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
// Each action owns its run id, so one key's sequence cannot cancel another's.
const sequenceRuns = new WeakMap();
// Page/profile transitions bump the epoch, stopping every pending sequence.
let sequenceEpoch = 0;

function beginSequence(action) {
  const id = (sequenceRuns.get(action) || 0) + 1;
  sequenceRuns.set(action, id);
  return { id, epoch: sequenceEpoch };
}

function sequenceAlive(action, run) {
  return sequenceRuns.get(action) === run.id && sequenceEpoch === run.epoch;
}

/** Stop delayed/running sequences without touching hold/double timers. */
function cancelSequences() {
  sequenceEpoch += 1;
}

// Running timers live in memory only (not in the config), keyed by the key's
// location ("page:<id>:<slot>" or "pin:<profile>:<slot>"). The action object is
// not stable: the inspector replaces it when a field changes, and a config
// reload replaces the whole graph. A timer belongs to the slot, not the object.
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

/** Find where this action lives: a page slot or a pinned slot. */
function timerLocation(action) {
  for (const page of state.config?.pages || []) {
    for (const [index, key] of Object.entries(page.keys || {})) {
      if (key?.action === action) {
        return { pageId: page.id, profileId: null, index: Number(index) };
      }
    }
  }
  for (const profile of state.config?.profiles || []) {
    for (const [index, key] of Object.entries(profile.pinned || {})) {
      if (key?.action === action) {
        return { pageId: null, profileId: profile.id, index: Number(index) };
      }
    }
  }
  return null;
}

function timerId(loc) {
  return loc.pageId ? `page:${loc.pageId}:${loc.index}` : `pin:${loc.profileId}:${loc.index}`;
}

/** The slot this timer occupies on the active page, or -1 when it is not shown. */
function timerSlot(loc) {
  const page = activePage();
  if (!page) return -1;
  if (loc.pageId) return loc.pageId === page.id ? loc.index : -1;
  if (loc.profileId !== page.profileId) return -1;
  return page.keys?.[loc.index] ? -1 : loc.index;
}

function timerTextFor(action) {
  if (!action || action.type !== 'timer') return '';
  const loc = timerLocation(action);
  if (!loc) return '';
  const timer = runningTimers.get(timerId(loc));
  if (!timer) return '';
  return formatTimer((timer.endsAt - Date.now()) / 1000);
}

function stopTimerAt(loc, id, { beep = false } = {}) {
  const timer = runningTimers.get(id);
  if (!timer) return;
  clearInterval(timer.handle);
  runningTimers.delete(id);
  const index = timerSlot(loc);
  if (index >= 0) {
    drawIndex(index);
    pushNow({ background: true });
  }
  if (beep) {
    if (timer.sound !== false) {
      api.runAction({ type: 'command', value: `afplay ${TIMER_SOUND}` }).catch(() => {});
    }
    toast('Timer finished');
  }
}

function stopTimer(action, options) {
  const loc = timerLocation(action);
  if (!loc) return;
  stopTimerAt(loc, timerId(loc), options);
}

function toggleTimer(action) {
  const loc = timerLocation(action);
  if (!loc) return;
  const id = timerId(loc);
  if (runningTimers.has(id)) {
    stopTimerAt(loc, id);
    toast('Timer cancelled');
    return;
  }
  const seconds = Math.max(1, Number(action.seconds) || 300);
  const timer = { endsAt: Date.now() + seconds * 1000, handle: null, sound: action.sound };
  const tick = () => {
    const left = timer.endsAt - Date.now();
    if (left <= 0) {
      stopTimerAt(loc, id, { beep: true });
      return;
    }
    const index = timerSlot(loc);
    if (index >= 0) {
      drawIndex(index);
      // A timer must count down in real time. Send only its slot through
      // protocol 0x0d instead of rebuilding and writing the whole page.
      scheduleLivePush(index);
    }
  };
  timer.handle = setInterval(tick, 1000);
  runningTimers.set(id, timer);
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

function popTextSize(text) {
  const length = [...String(text || '')].length;
  return Math.max(11, 18 - Math.round(Math.max(0, length - 4) * 0.9));
}

function popItem(action) {
  if (!action) return { label: '', emoji: '', icon: '' };
  const icon = typeof actionIconSrc === 'function' ? actionIconSrc(action) || '' : '';
  if (action.type === 'text') {
    const text = String(action.value || '').trim();
    if (!text) return { label: 'Type text', emoji: '', icon };
    if (typeof isEmojiOnly === 'function' && isEmojiOnly(text)) {
      return { label: '', emoji: text, icon: '' };
    }
    const truncate = window.KeyRenderer?.truncateMain;
    const label = typeof truncate === 'function' ? truncate(text) : text.slice(0, 12);
    return {
      label,
      emoji: '',
      icon: '',
      text: true,
      fontSize: popTextSize(label),
      title: text,
    };
  }
  const meta = typeof actionMeta === 'function' ? actionMeta(action) : {};
  const fallbackLabel = {
    app: 'Open app',
    url: 'Open URL',
    hotkey: 'Hotkey',
    command: 'Command',
    media: 'Media',
    page: 'Page',
    close: 'Close app',
    sound: 'Audio',
    plugin: 'Plugin',
  }[action.type] || action.type;
  return { emoji: '', label: meta.label || fallbackLabel, icon };
}

/** A step is normally {action}, but imports may keep a bare action. */
function stepAction(step) {
  if (!step || typeof step !== 'object' || step.delay !== undefined) return null;
  if (step.action && typeof step.action === 'object') return step.action.type ? step.action : null;
  // A bare plugin step's `action` is its action UUID, not a nested action.
  return step.type ? step : null;
}

async function openPop(action) {
  const steps = (Array.isArray(action.steps) ? action.steps : [])
    .map((step) => stepAction(step))
    .filter((step) => step && step.type !== 'none')
    .slice(0, 9);
  if (!steps.length) return toast('POP menu has no actions', true);
  const index = await api.showPop(steps.map(popItem));
  if (index >= 0 && steps[index]) runKeyAction(steps[index]);
}

async function runKeyAction(action, meta = null) {
  if (!action || action.type === 'none' || !action.type) return { ok: true };
  if (action.type === 'indicator') return { ok: true };
  if (action.type === 'pop') {
    await openPop(action);
    return { ok: true };
  }
  if (action.type === 'timer') {
    toggleTimer(action);
    return { ok: true };
  }
  if (action.type === 'brightness') {
    runBrightnessAction(action);
    return { ok: true };
  }
  if (action.type === 'multi') return runMulti(action);
  if (action.type === 'toggle') return runToggle(action);
  if (action.type === 'page') {
    if (action.op === 'next') navigateRelative(1);
    else if (action.op === 'prev') navigateRelative(-1);
    else if (action.op === 'profile') switchProfile(action.value);
    else if (action.op === 'back') {
      const parent = activePage().parentId;
      if (parent) navigate(parent);
      else navigateRelative(-1);
    } else if (!action.value) {
      // Older configs may have a goto with no target; move forward instead.
      navigateRelative(1);
    } else {
      navigate(action.value);
    }
    return { ok: true };
  }
  if (action.type === 'plugin') {
    try {
      notePluginKeyPress();
      const res = await api.runPluginAction(action.actionid);
      if (res.ok) return { ok: true };
      const plugin = (state.plugins || []).find((p) => p.uuid === action.plugin);
      if (plugin?.compatReason) {
        const error = `${plugin.name}: ${plugin.compatReason}. Install Rosetta to run Intel-only plugins.`;
        toast(error, true);
        return { ok: false, error };
      }
      const error = 'Plugin action is not ready yet';
      toast(error, true);
      return { ok: false, error };
    } catch (err) {
      const error = err.message || String(err);
      toast(error, true);
      return { ok: false, error };
    }
  }
  // A command that displays its output is refreshed instead of executed twice:
  // the periodic runner is the single place that spawns it.
  if (action.type === 'command' && action.showOutput && typeof refreshCommandOutput === 'function') {
    refreshCommandOutput(action);
    return { ok: true };
  }
  // Launch-only shell commands resolve when the process spawns (see
  // lib/actions.js runShell); text and hotkeys resolve when they finish.
  try {
    const res = await api.runAction(action, meta);
    if (res.ok) return { ok: true };
    toast(res.error || 'action failed', true);
    if (res.permission === 'accessibility') api.requestAccessibility?.();
    return { ok: false, error: res.error || 'action failed' };
  } catch (err) {
    const error = err.message || String(err);
    toast(error, true);
    return { ok: false, error };
  }
}

/** Multi Action: sequence / alternate / random, with delay steps. */
async function runMulti(action) {
  const steps = Array.isArray(action.steps) ? action.steps : [];
  if (!steps.length) return { ok: true };
  const run = beginSequence(action);
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
    if (!sequenceAlive(action, run)) return { ok: false, error: 'cancelled' };
    const step = steps[index];
    if (!step) continue;
    if (step.delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(step.delay) || 0)));
      continue;
    }
    const stepToRun = stepAction(step);
    if (!stepToRun) continue;
    const result = await runKeyAction(stepToRun);
    if (!sequenceAlive(action, run)) return { ok: false, error: 'cancelled' };
    if (result && result.ok === false) return result;
  }
  return { ok: true };
}

/** Hotkey Switch: alternate between two actions on each press. */
async function runToggle(action) {
  const steps = Array.isArray(action.steps) ? action.steps : [];
  if (!steps.length) return { ok: true };
  const index = multiState.get(action) || 0;
  multiState.set(action, (index + 1) % steps.length);
  const step = steps[index % steps.length];
  const nextAction = stepAction(step);
  if (!nextAction) return { ok: true };
  return runKeyAction(nextAction);
}

function flashKey(index, kind = 'pressed') {
  const tile = $('#grid').children[index];
  if (!tile) return;
  tile.classList.add(kind);
  setTimeout(() => tile.classList.remove(kind), kind === 'error' ? 700 : 160);
}

const WIDE_MODE_ORDER = ['clock', 'stats', 'blank'];
const WIDE_MODE_LABELS = { clock: 'Clock', stats: 'System stats', blank: 'Background' };

function currentWideMode(page) {
  return page?.wideMode === 'stats' || page?.wideMode === 'blank' ? page.wideMode : 'clock';
}

/** The deck cycles its own wide-key panel; mirror that on the dashboard. */
function cycleWideMode() {
  const page = activePage();
  if (!page) return;
  const index = WIDE_MODE_ORDER.indexOf(currentWideMode(page));
  const next = WIDE_MODE_ORDER[(index + 1) % WIDE_MODE_ORDER.length];
  if (next === 'clock') delete page.wideMode;
  else page.wideMode = next;
  scheduleSave();
  drawIndex(WIDE_KEY_INDEX);
  if (state.selected === WIDE_KEY_INDEX) renderInspector();
  if (typeof refreshWideStats === 'function') refreshWideStats();
  // Keep the real panel in step (stats start flowing, clock sync pauses).
  api.setWideMode(next);
  toast(`Wide key: ${WIDE_MODE_LABELS[next]}`);
}

function handleKeyEvent(index, pressed, dialState = null) {
  // While the lock screen is active, ignore hardware input.
  if (typeof lockActive === 'function' && lockActive()) return;
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
  // The side keys and encoders have independently configurable actions.
  // Unknown events remain untouched by the normal square-key handling.
  if (window.D200XPhysicalControls?.handle(index, pressed, dialState)) return;
  // The wide key cycles the firmware panel: clock → system stats → background.
  // Never send an action for it (proto 0x0e resets the deck to its factory profile).
  if (index === WIDE_KEY_INDEX) {
    if (pressed) {
      flashKey(index);
      cycleWideMode();
    }
    return;
  }
  const key = keyAt(activePage(), index);
  if (!key) return;
  const meta = (field) => ({ pageId: activePage()?.id, index, field });

  // Stream Deck plugins own their own keyDown/keyUp state machine (tap, hold,
  // double press, etc.), so forward real press/release events instead of
  // synthesising a tap.
  if (key.action?.type === 'plugin' && key.action.sdk === 'streamdeck') {
    if (pressed) {
      flashKey(index);
      notePluginKeyPress();
    }
    api.pluginKey(key.action.actionid, pressed);
    return;
  }

  const hasHold = key.holdAction && key.holdAction.type !== 'none';
  const hasDouble = key.doubleAction && key.doubleAction.type !== 'none';
  if (!hasHold && !hasDouble) {
    if (pressed) {
      flashKey(index);
      runKeyAction(key.action, meta('action'));
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
        runKeyAction(key.doubleAction, meta('doubleAction'));
        return;
      }
    }
    if (st.holdTimer || st.held) return; // key is already held
    st.held = false;
    if (hasHold) {
      st.holdTimer = setTimeout(() => {
        st.holdTimer = null;
        st.held = true;
        runKeyAction(key.holdAction, meta('holdAction'));
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
      runKeyAction(key.action, meta('action'));
    }, DOUBLE_WINDOW);
  } else {
    runKeyAction(key.action, meta('action'));
  }
}

