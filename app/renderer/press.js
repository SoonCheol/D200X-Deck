'use strict';

// -------------------------------------------------------------- key presses

const pressState = new Map();
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

function runKeyAction(action) {
  if (!action || action.type === 'none') return;
  if (action.type === 'indicator') return;
  if (action.type === 'multi') return runMulti(action);
  if (action.type === 'toggle') return runToggle(action);
  if (action.type === 'page') {
    if (action.op === 'next') return navigateRelative(1);
    if (action.op === 'prev') return navigateRelative(-1);
    if (action.op === 'profile') {
      const target = state.config.pages.find((p) => p.profileId === action.value);
      if (target) {
        state.config.activeProfileId = action.value;
        state.config.activePageId = target.id;
        state.selected = null;
        renderAll();
        commit();
      }
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
  const key = activePage().keys[index];
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

