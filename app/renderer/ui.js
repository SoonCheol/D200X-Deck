'use strict';

// --------------------------------------------------------------- rendering

let autoExitTimer = null;

/** Return a subpage to its parent after its configured idle time. */
function scheduleAutoExit(page = activePage()) {
  clearTimeout(autoExitTimer);
  autoExitTimer = null;
  if (!page || !page.parentId) return;
  const seconds = Math.max(0, Number(page.autoExitSeconds) || 0);
  if (!seconds) return;
  autoExitTimer = setTimeout(() => {
    const current = activePage();
    if (!current || current.id !== page.id || !page.parentId) return;
    if (typeof standbyActive === 'function' && standbyActive()) return scheduleAutoExit(page);
    if (typeof lockActive === 'function' && lockActive()) return scheduleAutoExit(page);
    navigate(page.parentId);
  }, seconds * 1000);
}

function renderAll() {
  renderProfileSelect();
  renderPageList();
  renderGrid();
  renderInspector();
  renderChrome();
  scheduleAutoExit();
}

function renderChrome() {
  const page = activePage();
  if (!page) return;
  const title = $('#page-title');
  if (document.activeElement !== title) title.value = page.name;
  const back = $('#page-back');
  if (back) {
    const parent = page.parentId ? state.config.pages.find((p) => p.id === page.parentId) : null;
    back.classList.toggle('hidden', !parent);
    back.title = parent ? `Back to “${parent.name}”` : '';
  }
  $('#autopush').checked = Boolean(state.config.settings.autoPush);
  $('#brightness').value = state.config.settings.brightness;
  $('#brightness-value').textContent = state.config.settings.brightness;
  renderStatus();
}

function renderStatus() {
  const { connected, info, message } = state.status;
  const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(message || ''));
  const pill = $('#status-pill');
  pill.textContent = connected ? 'Connected' : busy ? 'In use' : 'No deck';
  pill.classList.toggle('on', connected);
  pill.classList.toggle('warn', !connected && busy);
  $('#device-dot').classList.toggle('on', connected);
  $('#device-led').classList.toggle('on', connected);
  $('#device-name').textContent = connected ? 'Ulanzi D200' : busy ? 'Deck in use' : 'No deck connected';
  $('#device-detail').textContent = connected
    ? `${info?.Dversion ? `fw ${info.Dversion} · ` : ''}${info?.SerialNumber || info?.serial || 'USB 2207:0019'}`
    : busy
      ? 'In use by Ulanzi Studio — quit it to connect'
      : 'Connect the D200 over USB';
  $('#device-card').title = connected ? '' : String(message || '');
  $('#device-serial').textContent = connected ? info?.SerialNumber || info?.serial || '' : '';
  const banner = $('#connect-banner');
  if (banner) {
    banner.classList.toggle('hidden', connected);
    const text = banner.querySelector('span');
    if (text) {
      text.textContent = busy
        ? 'The Deck is in use by Ulanzi Studio. Quit it, then reconnect.'
        : 'Connect your D200. If Ulanzi Studio is open, quit it.';
    }
  }
  if (!connected) {
    const stateEl = $('#push-state');
    if (stateEl) stateEl.textContent = busy ? 'in use' : 'no deck';
  }
  renderSyncState();
}

/** The deck and the editor agree only after a successful push. */
function renderSyncState() {
  const pushBtn = $('#push-btn');
  if (pushBtn) pushBtn.classList.toggle('unsynced', Boolean(state.unsynced));
  renderPushButton();
  if (!state.status.connected || state.pushing || !state.unsynced) return;
  const stateEl = $('#push-state');
  if (stateEl) stateEl.textContent = 'unsynced changes';
}

/**
 * Auto-push makes the button redundant while everything is in sync; keep it
 * available when a push failed or auto-push is off, so there is always a manual
 * retry. ⌘S still forces a push.
 */
function renderPushButton() {
  const pushBtn = $('#push-btn');
  if (!pushBtn) return;
  const connected = Boolean(state.status.connected);
  const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(state.status.message || ''));
  const autoPush = Boolean(state.config?.settings?.autoPush);
  const retry = Boolean(state.unsynced);
  const autoOnly = connected && autoPush && !retry;
  // A background live-image push must not toggle the toolbar button.
  const foregroundPushing = state.pushing && !state.backgroundPush;
  // aria-disabled (not disabled) keeps the native title tooltip and keyboard
  // focus; the click handler explains the block instead of pushing.
  const blocked = !connected || foregroundPushing || autoOnly;
  pushBtn.disabled = false;
  const aria = String(blocked);
  if (pushBtn.getAttribute('aria-disabled') !== aria) pushBtn.setAttribute('aria-disabled', aria);
  const label = connected ? 'Push to Deck' : busy ? 'Deck in use' : 'Connect deck';
  if (pushBtn.textContent !== label) pushBtn.textContent = label;
  let tipText = 'Send this page to the Deck';
  if (!connected) {
    tipText = busy ? 'Quit Ulanzi Studio to connect' : 'Connect the D200 first';
  } else if (foregroundPushing) {
    tipText = 'Pushing this page to the Deck…';
  } else if (autoOnly) {
    tipText =
      'Auto-push is on — changes go to the Deck automatically. Turn it off in Deck settings, or press ⌘S, to push manually.';
  } else if (retry) {
    tipText = 'Some changes have not reached the Deck yet — push to retry.';
  }
  const tip = $('#push-tip');
  if (tip && tip.textContent !== tipText) tip.textContent = tipText;
}

let pageDragId = null;

function clearPageDropMarkers() {
  document
    .querySelectorAll('#page-list .drop-before, #page-list .drop-after')
    .forEach((row) => row.classList.remove('drop-before', 'drop-after'));
}

/** Move a page next to a sibling in the same profile; other profiles stay put. */
function movePage(sourceId, targetId, after = false) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const pages = state.config.pages;
  const source = pages.find((p) => p.id === sourceId);
  const target = pages.find((p) => p.id === targetId);
  if (!source || !target || source.profileId !== target.profileId) return false;
  const before = pages.indexOf(source);
  pages.splice(before, 1);
  const at = pages.indexOf(target) + (after ? 1 : 0);
  if (at === before) {
    pages.splice(before, 0, source);
    return false;
  }
  pages.splice(at, 0, source);
  return true;
}

function focusPage(id) {
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('#page-list .page-item')].find(
      (item) => item.dataset.pageId === id
    );
    row?.focus();
  });
}

function movePageBy(pageId, delta) {
  const page = state.config.pages.find((p) => p.id === pageId);
  if (!page) return false;
  const siblings = state.config.pages.filter((p) => p.profileId === page.profileId);
  const index = siblings.findIndex((p) => p.id === pageId);
  const target = siblings[index + delta];
  if (!target) return false;
  if (!movePage(pageId, target.id, delta > 0)) return false;
  commit(false);
  renderPageList();
  focusPage(pageId);
  return true;
}

function renderPageList() {
  const list = $('#page-list');
  list.innerHTML = '';
  const profilePages = state.config.pages.filter(
    (p) => p.profileId === state.config.activeProfileId
  );
  const byId = new Map(profilePages.map((p) => [p.id, p]));
  const depthOf = (page) => {
    let depth = 0;
    let current = page;
    const seen = new Set();
    while (current?.parentId && byId.has(current.parentId) && depth < 8 && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId);
      depth += 1;
    }
    return depth;
  };
  profilePages.forEach((page) => {
    const depth = depthOf(page);
    const el = document.createElement('div');
    el.className = `page-item${page.id === state.config.activePageId ? ' active' : ''}`;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-current', page.id === state.config.activePageId ? 'page' : 'false');
    el.setAttribute('aria-label', `Page ${page.name}`);
    el.dataset.pageId = page.id;
    el.draggable = true;
    el.title = 'Drag to reorder · ⌥↑/⌥↓';
    if (depth) {
      el.classList.add('subpage');
      el.style.paddingLeft = `${10 + depth * 12}px`;
    }
    el.innerHTML = `<span class="dot"></span><span class="name">${depth ? '↳ ' : ''}${esc(page.name)}</span>`;
    el.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        e.stopPropagation();
        movePageBy(page.id, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPage(page.id);
      }
    });
    el.addEventListener('dragstart', (e) => {
      pageDragId = page.id;
      e.dataTransfer.setData('application/x-ulanzi-page', page.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      pageDragId = null;
      el.classList.remove('dragging');
      clearPageDropMarkers();
    });
    el.addEventListener('dragover', (e) => {
      if (!pageDragId && !Array.from(e.dataTransfer.types).includes('application/x-ulanzi-page')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      clearPageDropMarkers();
      el.classList.add(e.clientY > rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
    });
    el.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      el.classList.remove('drop-before', 'drop-after');
    });
    el.addEventListener('drop', (e) => {
      if (!pageDragId && !Array.from(e.dataTransfer.types).includes('application/x-ulanzi-page')) return;
      e.preventDefault();
      const sourceId = pageDragId || e.dataTransfer.getData('application/x-ulanzi-page');
      const rect = el.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      pageDragId = null;
      el.classList.remove('dragging');
      clearPageDropMarkers();
      if (movePage(sourceId, page.id, after)) {
        commit(false);
        renderPageList();
      }
    });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete page';
    del.setAttribute('aria-label', `Delete page ${page.name}`);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePage(page.id);
    });
    el.appendChild(del);
    el.addEventListener('click', () => selectPage(page.id));
    list.appendChild(el);
  });
}

async function renderGrid() {
  if (!activePage()) {
    const grid = $('#grid');
    if (grid) grid.innerHTML = '';
    return;
  }
  const grid = $('#grid');
  const page = activePage();
  grid.innerHTML = '';

  for (let i = 0; i < KEY_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'key';
    btn.dataset.index = String(i);
    if (state.selected === i) btn.classList.add('selected');

    const wide = i === WIDE_KEY_INDEX;
    if (wide) btn.classList.add('wide');
    const slotKey = keyAt(page, i) || emptyKey();
    const actionLabel =
      slotKey.action && slotKey.action.type !== 'none'
        ? ACTION_LABELS[slotKey.action.type] || slotKey.action.type
        : 'Empty key';
    const keyName = (slotKey.label || slotKey.emoji || '').trim();
    btn.setAttribute('aria-label', `Key ${i + 1}: ${keyName || 'empty'} — ${actionLabel}`);

    const canvas = document.createElement('canvas');
    canvas.width = wide ? 402 : 196;
    canvas.height = 196;
    btn.appendChild(canvas);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(i + 1);
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);

    if (wide) {
      btn.title = 'Wide key — clock, system stats or background';
      btn.setAttribute('aria-label', 'Wide key — clock, system stats or background');
      btn.classList.add('system');
      btn.addEventListener('click', () => {
        state.selected = WIDE_KEY_INDEX;
        renderGrid();
        renderInspector();
      });
      grid.appendChild(btn);
      continue;
    }

    const pinnedTile = isPinnedSlot(page, i);
    btn.draggable = !pinnedTile;
    if (pinnedTile) {
      const pin = document.createElement('span');
      pin.className = 'pin-badge';
      pin.textContent = 'PIN';
      btn.appendChild(pin);
    }
    btn.addEventListener('click', () => {
      state.selected = i;
      renderGrid();
      renderInspector();
    });

    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-ulanzi-key', String(i));
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
      $('#grid').classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      $('#grid').classList.remove('dragging');
      document.querySelectorAll('.key.drop-target').forEach((el) => el.classList.remove('drop-target'));
    });
    btn.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-ulanzi-key')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drop-target');
      }
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'));

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('drag');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag'));
    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      btn.classList.remove('drag', 'drop-target');
      const src = Number(e.dataTransfer.getData('application/x-ulanzi-key'));
      if (!Number.isNaN(src) && e.dataTransfer.getData('application/x-ulanzi-key')) {
        moveKey(page, src, i);
        return;
      }
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Drop an image file', true);
        return;
      }
      const dataUrl = await downscaleImage(await readFileAsDataUrl(file));
      const key = ensureKey(activePage(), i);
      key.icon = dataUrl;
      key.face = 'icon';
      delete key.iconCleared;
      state.selected = i;
      drawIndex(i);
      commit();
      renderInspector();
    });

    grid.appendChild(btn);
  }

  await drawGrid();
}

let wideStats = { cpu: 0, mem: 0, gpu: 0 };

function wideOptions(page) {
  return {
    mode: page?.wideMode || 'clock',
    stats: wideStats,
    background: page ? backgroundFor(page) : null,
  };
}

async function refreshWideStats() {
  const page = activePage();
  if (!page) return;
  const mode = page.wideMode || 'clock';
  if (mode === 'blank') return;
  if (mode === 'stats') {
    try {
      wideStats = await api.systemStats();
    } catch {
      /* keep the previous sample */
    }
  }
  const tile = $('#grid').children[WIDE_KEY_INDEX];
  if (tile) renderSystemPanel(tile.querySelector('canvas'), wideOptions(page));
}

async function drawGrid() {
  const page = activePage();
  const tiles = [...$('#grid').children];
  if ((page?.wideMode || 'clock') === 'stats') {
    try {
      wideStats = await api.systemStats();
    } catch {
      /* keep the previous sample */
    }
  }
  await Promise.all(
    tiles.map((tile, i) => {
      if (i === WIDE_KEY_INDEX) return renderSystemPanel(tile.querySelector('canvas'), wideOptions(page));
      const key = effectiveKey(keyAt(page, i) || emptyKey());
      return renderKey(
        tile.querySelector('canvas'),
        key,
        196,
        196,
        autoIconFor(key),
        { ...pageInfo(), slot: i, background: backgroundFor(page) }
      );
    })
  );
}

function drawIndex(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  if (index === WIDE_KEY_INDEX) {
    const page = activePage();
    return renderSystemPanel(tile.querySelector('canvas'), wideOptions(page));
  }
  const page = activePage();
  const key = effectiveKey(keyAt(page, index) || emptyKey());
  renderKey(
    tile.querySelector('canvas'),
    key,
    196,
    196,
    autoIconFor(key),
    { ...pageInfo(), slot: index, background: backgroundFor(page) }
  );
}

function moveKey(page, src, dst) {
  if (src === dst || src === WIDE_KEY_INDEX || dst === WIDE_KEY_INDEX) return;
  const source = page.keys[src];
  const target = page.keys[dst];
  if (!source && !target) return;
  if (source) {
    page.keys[dst] = source;
    if (target) page.keys[src] = target;
    else delete page.keys[src];
  } else {
    page.keys[src] = target;
    delete page.keys[dst];
  }
  for (const index of [src, dst]) {
    const key = page.keys[index];
    if (key && key.action && key.action.type === 'plugin') {
      key.action.actionid = uuid();
    }
  }
  state.selected = dst;
  commit();
  renderGrid();
  renderInspector();
}

/** Shrink an image to 392 px so key images stay small in the config. */
function downscaleImage(dataUrl, size = 392) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Scale a background to the full 5×3 key surface (980×588), cropping to cover. */
function downscaleBackground(dataUrl, width = 980, height = 588) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Capture what the deck currently shows as one 980×588 PNG. */
async function capturePageImage() {
  await drawGrid();
  const tiles = $('#grid').children;
  if (!tiles.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 980;
  canvas.height = 588;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 13; i++) {
    const tile = tiles[i]?.querySelector('canvas');
    if (!tile) continue;
    ctx.drawImage(tile, (i % 5) * 196, Math.floor(i / 5) * 196);
  }
  return canvas.toDataURL('image/jpeg', 0.9);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ------------------------------------------------------------- persistence

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveConfig(state.config).catch((err) => toast(`Could not save: ${err.message}`, true));
  }, 250);
}

async function loadSiteIcon(key, report = false) {
  const url = String(key.action?.value || '').trim();
  if (!url) return false;
  const res = await api.fetchSiteIcon(url);
  if (!res.ok) {
    if (report) toast(res.error || 'No icon found', true);
    return false;
  }
  key.icon = res.dataUrl;
  key.iconSource = 'site';
  key.face = 'icon';
  delete key.iconCleared;
  drawIndex(state.selected);
  commit();
  if (report) toast('Favicon loaded');
  return true;
}

function commit(redraw = true) {
  scheduleSave();
  if (redraw) drawGrid();
  // Without auto-push (or without a deck) an edit leaves the physical keypad
  // behind until the user pushes.
  if (!state.config.settings.autoPush || !state.status.connected) {
    state.unsynced = true;
    renderSyncState();
  }
  schedulePush();
  schedulePluginsSync();
}

// --------------------------------------------------------------- plugins

let pluginSyncTimer = null;

function keyIndexToSlot(index) {
  return `${index % COLS}_${Math.floor(index / COLS)}`;
}

function schedulePluginsSync() {
  clearTimeout(pluginSyncTimer);
  pluginSyncTimer = setTimeout(syncPlugins, 250);
}

function collectPluginActions(action, slot, active, wanted, seen) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'plugin') {
    if (!action.plugin || !action.action) return;
    if (!action.actionid) action.actionid = uuid();
    if (seen.has(action.actionid)) return;
    seen.add(action.actionid);
    wanted.push({
      actionid: action.actionid,
      sdk: action.sdk || state.plugins.find((p) => p.uuid === action.plugin)?.sdk || 'ulanzi',
      plugin: action.plugin,
      action: action.action,
      key: slot,
      settings: action.settings || {},
      active,
    });
    return;
  }
  if (Array.isArray(action.steps)) {
    for (const step of action.steps) {
      if (!step || typeof step !== 'object') continue;
      // Steps are normally {action}, but imports may keep a bare action. A
      // bare plugin step's `action` is its action UUID, so check the type.
      const nested = step.action && typeof step.action === 'object' ? step.action : step;
      collectPluginActions(nested, slot, active, wanted, seen);
    }
  }
}

function syncPlugins() {
  if (!state.config) return;
  const wanted = [];
  const seen = new Set();
  for (const page of state.config.pages) {
    const active = page.id === state.config.activePageId;
    for (const [index, key] of Object.entries(page.keys)) {
      if (Number(index) === WIDE_KEY_INDEX || !key) continue;
      const slot = keyIndexToSlot(Number(index));
      // Hold/double and multi/toggle/POP steps need the same registration as
      // the face action, or their plugin actions cannot run.
      for (const action of [key.action, key.holdAction, key.doubleAction]) {
        collectPluginActions(action, slot, active, wanted, seen);
      }
    }
  }
  // Pinned keys are visible on every page of the active profile (unless a page
  // overrides that slot).
  for (const [index, key] of Object.entries(pinnedFor())) {
    if (Number(index) === WIDE_KEY_INDEX || !key) continue;
    const slot = keyIndexToSlot(Number(index));
    const active = !activePage()?.keys?.[index];
    for (const action of [key.action, key.holdAction, key.doubleAction]) {
      collectPluginActions(action, slot, active, wanted, seen);
    }
  }
  return api.syncPlugins(wanted).catch((err) => toast(err.message || String(err), true));
}

const LIVE_PUSH_INTERVAL = 5000;
let livePushTimer = null;
let livePushPending = false;
let lastLivePushAt = 0;

/**
 * Plugin live images can update every second. A full page is hundreds of KB
 * over HID, so coalesce those updates and refresh at most once every few
 * seconds. These pushes are background-only: they must not toggle the Push
 * button or claim the page was manually synced.
 */
function scheduleLivePush() {
  if (typeof standbyActive === 'function' && standbyActive()) return;
  if (typeof lockActive === 'function' && lockActive()) return;
  if (!state.status.connected || !state.config.settings.autoPush) return;
  livePushPending = true;
  if (livePushTimer) return;
  const wait = Math.max(0, LIVE_PUSH_INTERVAL - (Date.now() - lastLivePushAt));
  livePushTimer = setTimeout(() => {
    livePushTimer = null;
    if (!livePushPending) return;
    livePushPending = false;
    if (state.pushing) {
      lastLivePushAt = Date.now();
      scheduleLivePush();
      return;
    }
    lastLivePushAt = Date.now();
    pushNow({ background: true });
  }, wait);
}

function schedulePush() {
  if (typeof standbyActive === 'function' && standbyActive()) return;
  if (typeof lockActive === 'function' && lockActive()) return;
  if (!state.status.connected || !state.config.settings.autoPush) return;
  clearTimeout(livePushTimer);
  livePushTimer = null;
  livePushPending = false;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 400);
}

async function pushNow({ background = false } = {}) {
  if (background) {
    // Never wake a sleeping/locked deck or push with auto-push off.
    if (!state.status.connected || !state.config.settings.autoPush) return;
    if (typeof standbyActive === 'function' && standbyActive()) return;
    if (typeof lockActive === 'function' && lockActive()) return;
  } else {
    // An explicit push (button, navigation, wake) always leaves a screensaver.
    if (typeof standbyActive === 'function' && standbyActive()) {
      standby.active = false;
      clearStandbyTimers();
    }
    if (typeof lockActive === 'function' && lockActive()) stopLock();
  }
  if (!state.status.connected) {
    if (!background) toast('Deck not connected — quit Ulanzi Studio and reconnect', true);
    return;
  }
  if (state.pushing) {
    if (!background) state.pushAgain = true;
    return;
  }
  state.pushing = true;
  state.backgroundPush = background;
  if (!background) lastLivePushAt = Date.now();
  if (!background) {
    $('#push-state').textContent = 'pushing…';
    renderPushButton();
  }
  try {
    await drawGrid();
    const grid = $('#grid');
    const images = [...grid.children].map((tile, index) => ({
      index,
      png: tile.querySelector('canvas').toDataURL('image/png').split(',')[1],
    }));
    const res = await api.pushPage(images, activePage()?.wideMode || 'clock');
    if (!res.ok) throw new Error(res.error || 'push failed');
    if (!background) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      $('#push-state').textContent = `synced ${time}`;
    }
    state.unsynced = false;
    renderSyncState();
    if (!background) {
      state.config.settings.lastPush = Date.now();
      scheduleSave();
    }
  } catch (err) {
    state.unsynced = true;
    if (!background) {
      $('#push-state').textContent = 'push failed';
      renderSyncState();
      toast(err.message || String(err), true);
    }
  } finally {
    state.pushing = false;
    state.backgroundPush = false;
    renderPushButton();
    if (background && state.unsynced) renderSyncState();
    if (state.pushAgain) {
      state.pushAgain = false;
      schedulePush();
    }
  }
}

// ------------------------------------------------------------------ pages

function selectPage(id) {
  clearPressTimers();
  if (state.config.activePageId === id) {
    state.selected = null;
    renderInspector();
    renderGrid();
    return;
  }
  state.config.activePageId = id;
  state.selected = null;
  scheduleSave();
  renderAll();
  schedulePush();
  schedulePluginsSync();
}

/** Next free "Page N" within a profile (gaps are not reused, deletions don't renumber). */
function nextPageName(profileId) {
  const names = state.config.pages.filter((p) => p.profileId === profileId).map((p) => p.name);
  if (!names.length) return 'Main';
  let max = 1;
  for (const name of names) {
    const match = /^Page (\d+)$/.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Page ${max + 1}`;
}

/** Make a name unique inside a profile ("Apps" → "Apps (2)"). */
function uniquePageName(base, profileId, ignoreId = null) {
  const taken = new Set(
    state.config.pages
      .filter((p) => p.profileId === profileId && p.id !== ignoreId)
      .map((p) => p.name.trim().toLowerCase())
  );
  const name = String(base || 'Page').trim() || 'Page';
  if (!taken.has(name.toLowerCase())) return name;
  let index = 2;
  while (taken.has(`${name} (${index})`.toLowerCase())) index += 1;
  return `${name} (${index})`;
}

function addPage() {
  const page = {
    id: uuid(),
    name: nextPageName(state.config.activeProfileId),
    profileId: state.config.activeProfileId,
    keys: {},
  };
  state.config.pages.push(page);
  state.config.activePageId = page.id;
  state.selected = null;
  renderAll();
  commit();
}

/** Add a key on the parent that opens an existing child page. */
function addOpenKeyForPage(parent, childId) {
  const child = state.config.pages.find((p) => p.id === childId);
  if (!parent || !child || child.parentId !== parent.id) return;
  const slot = nextFreeIndex(parent);
  if (slot < 0) return toast('No free key slot on this page', true);
  parent.keys[slot] = {
    emoji: '',
    label: child.name,
    color: '#1b2130',
    icon: null,
    action: { type: 'page', op: 'goto', value: child.id },
  };
  state.config.activePageId = parent.id;
  state.selected = slot;
  renderAll();
  commit();
  toast(`Added “${child.name}” to key ${slot + 1}`);
}

/** Create a child page with an open key on the parent and a Back key on it. */
function addSubpage(parent) {
  if (!parent) return;
  const child = {
    id: uuid(),
    name: nextPageName(parent.profileId),
    profileId: parent.profileId,
    parentId: parent.id,
    keys: {},
  };
  state.config.pages.push(child);
  const openSlot = nextFreeIndex(parent);
  if (openSlot >= 0) {
    parent.keys[openSlot] = {
      emoji: '',
      label: child.name,
      color: '#1b2130',
      icon: null,
      action: { type: 'page', op: 'goto', value: child.id },
    };
  }
  const backSlot = nextFreeIndex(child);
  if (backSlot >= 0) {
    child.keys[backSlot] = {
      emoji: '',
      label: 'Back',
      color: '#1b2130',
      icon: null,
      action: { type: 'page', op: 'back' },
    };
  }
  state.config.activePageId = child.id;
  state.selected = null;
  renderAll();
  commit();
  toast(
    openSlot >= 0
      ? `Created “${child.name}” — key ${openSlot + 1} on “${parent.name}” opens it`
      : `Created “${child.name}” — add a key on “${parent.name}” to open it`
  );
}

async function deletePage(id) {
  const page = state.config.pages.find((p) => p.id === id);
  if (!page) return;
  const profilePages = state.config.pages.filter(
    (p) => p.profileId === (page.profileId || state.config.activeProfileId)
  );
  if (profilePages.length <= 1) {
    toast('A profile needs at least one page', true);
    return;
  }
  const keys = Object.keys(page.keys || {}).length;
  const ok = await confirmAction({
    title: `Delete “${page.name}”?`,
    message: `This removes the page and its ${keys} key${keys === 1 ? '' : 's'}. This can’t be undone.`,
    confirmLabel: 'Delete page',
  });
  if (!ok) return;
  state.config.pages = state.config.pages.filter((p) => p.id !== id);
  if (state.config.activePageId === id) {
    const remaining = state.config.pages.filter(
      (p) => p.profileId === state.config.activeProfileId
    );
    state.config.activePageId = (remaining[0] || state.config.pages[0]).id;
  }
  state.selected = null;
  renderAll();
  commit();
  scheduleSave();
}

function clearPressTimers() {
  for (const st of pressState.values()) {
    if (st.holdTimer) clearTimeout(st.holdTimer);
    if (st.tapTimer) clearTimeout(st.tapTimer);
    st.holdTimer = null;
    st.tapTimer = null;
  }
  pressState.clear();
  if (typeof cancelSequences === 'function') cancelSequences();
}

function navigate(pageId) {
  if (!state.config.pages.some((p) => p.id === pageId)) return;
  clearPressTimers();
  state.config.activePageId = pageId;
  state.selected = null;
  scheduleSave();
  renderAll();
  pushNow();
  schedulePluginsSync();
}

// ------------------------------------------------------------------ toast

let toastTimer = null;
function toast(message, bad = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

