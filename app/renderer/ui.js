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
  const pill = $('#status-pill');
  pill.textContent = connected ? 'Connected' : 'Disconnected';
  pill.classList.toggle('on', connected);
  $('#device-dot').classList.toggle('on', connected);
  $('#device-led').classList.toggle('on', connected);
  const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(message || ''));
  $('#device-name').textContent = connected ? 'Ulanzi D200' : busy ? 'Deck busy' : 'No Deck found';
  $('#device-detail').textContent = connected
    ? `${info?.Dversion ? `fw ${info.Dversion} · ` : ''}${info?.SerialNumber || info?.serial || 'USB 2207:0019'}`
    : busy
      ? 'Ulanzi Studio is using it'
      : message || 'Connect the D200 over USB';
  $('#device-card').title = connected ? '' : String(message || '');
  $('#device-serial').textContent = connected ? info?.SerialNumber || info?.serial || '' : '';
  const pushBtn = $('#push-btn');
  if (pushBtn) {
    pushBtn.disabled = !connected;
    pushBtn.textContent = connected ? 'Push to Deck' : 'Deck offline';
    pushBtn.title = connected ? 'Send this page to the Deck' : 'Connect the Deck first (or quit Ulanzi Studio)';
  }
  if (!connected) {
    const stateEl = $('#push-state');
    if (stateEl) stateEl.textContent = 'not connected';
  }
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
    if (depth) {
      el.classList.add('subpage');
      el.style.paddingLeft = `${10 + depth * 12}px`;
    }
    el.innerHTML = `<span class="dot"></span><span class="name">${depth ? '↳ ' : ''}${esc(page.name)}</span>`;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPage(page.id);
      }
    });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete page';
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
    const canvas = document.createElement('canvas');
    canvas.width = wide ? 402 : 196;
    canvas.height = 196;
    btn.appendChild(canvas);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(i + 1);
    btn.appendChild(badge);

    if (wide) {
      btn.title = 'Wide key — clock, system stats or background';
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

function syncPlugins() {
  if (!state.config) return;
  const wanted = [];
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (Number(index) === WIDE_KEY_INDEX) continue;
      if (!key || key.action?.type !== 'plugin') continue;
      if (!key.action.plugin || !key.action.action) continue;
      if (!key.action.actionid) key.action.actionid = uuid();
      wanted.push({
        actionid: key.action.actionid,
        sdk: key.action.sdk || state.plugins.find((p) => p.uuid === key.action.plugin)?.sdk || 'ulanzi',
        plugin: key.action.plugin,
        action: key.action.action,
        key: keyIndexToSlot(Number(index)),
        settings: key.action.settings || {},
        active: page.id === state.config.activePageId,
      });
    }
  }
  // Pinned keys are visible on every page of the active profile (unless a page
  // overrides that slot).
  for (const [index, key] of Object.entries(pinnedFor())) {
    if (Number(index) === WIDE_KEY_INDEX) continue;
    if (!key || key.action?.type !== 'plugin') continue;
    if (!key.action.plugin || !key.action.action) continue;
    if (!key.action.actionid) key.action.actionid = uuid();
    wanted.push({
      actionid: key.action.actionid,
      sdk: key.action.sdk || state.plugins.find((p) => p.uuid === key.action.plugin)?.sdk || 'ulanzi',
      plugin: key.action.plugin,
      action: key.action.action,
      key: keyIndexToSlot(Number(index)),
      settings: key.action.settings || {},
      active: !activePage()?.keys?.[index],
    });
  }
  return api.syncPlugins(wanted).catch((err) => toast(err.message || String(err), true));
}

function schedulePush() {
  if (typeof standbyActive === 'function' && standbyActive()) return;
  if (typeof lockActive === 'function' && lockActive()) return;
  if (!state.status.connected || !state.config.settings.autoPush) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 400);
}

async function pushNow() {
  // An explicit push (button, navigation, wake) always leaves a screensaver.
  if (typeof standbyActive === 'function' && standbyActive()) {
    standby.active = false;
    clearStandbyTimers();
  }
  if (typeof lockActive === 'function' && lockActive()) stopLock();
  if (!state.status.connected) {
    toast('Deck not connected — quit Ulanzi Studio and reconnect', true);
    return;
  }
  if (state.pushing) {
    state.pushAgain = true;
    return;
  }
  state.pushing = true;
  $('#push-state').textContent = 'pushing…';
  try {
    await drawGrid();
    const grid = $('#grid');
    const images = [...grid.children].map((tile, index) => ({
      index,
      png: tile.querySelector('canvas').toDataURL('image/png').split(',')[1],
    }));
    const res = await api.pushPage(images, activePage()?.wideMode || 'clock');
    if (!res.ok) throw new Error(res.error || 'push failed');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#push-state').textContent = `synced ${time}`;
    state.config.settings.lastPush = Date.now();
    scheduleSave();
  } catch (err) {
    $('#push-state').textContent = 'push failed';
    toast(err.message || String(err), true);
  } finally {
    state.pushing = false;
    if (state.pushAgain) {
      state.pushAgain = false;
      schedulePush();
    }
  }
}

// ------------------------------------------------------------------ pages

function selectPage(id) {
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

function deletePage(id) {
  const page = state.config.pages.find((p) => p.id === id);
  if (!page) return;
  const profilePages = state.config.pages.filter(
    (p) => p.profileId === (page.profileId || state.config.activeProfileId)
  );
  if (profilePages.length <= 1) {
    toast('A profile needs at least one page', true);
    return;
  }
  if (!confirm(`Delete page “${page.name}”?`)) return;
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

