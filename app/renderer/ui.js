'use strict';

// --------------------------------------------------------------- rendering

function renderAll() {
  renderPageList();
  renderGrid();
  renderInspector();
  renderChrome();
}

function renderChrome() {
  const page = activePage();
  const title = $('#page-title');
  if (document.activeElement !== title) title.value = page.name;
  $('#autopush').checked = Boolean(state.config.settings.autoPush);
  $('#brightness').value = state.config.settings.brightness;
  $('#brightness-value').textContent = state.config.settings.brightness;
  renderStatus();
}

function renderStatus() {
  const { connected, info, message } = state.status;
  const pill = $('#status-pill');
  pill.textContent = connected ? 'online' : 'offline';
  pill.classList.toggle('on', connected);
  $('#device-dot').classList.toggle('on', connected);
  $('#device-led').classList.toggle('on', connected);
  const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(message || ''));
  $('#device-name').textContent = connected ? 'Ulanzi D200' : busy ? 'Deck busy' : 'No deck found';
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
    pushBtn.textContent = connected ? 'Push to deck' : 'Deck offline';
    pushBtn.title = connected ? 'Send this page to the deck' : 'Connect the deck first (or quit Ulanzi Studio)';
  }
  if (!connected) {
    const stateEl = $('#push-state');
    if (stateEl) stateEl.textContent = 'not connected';
  }
}

function renderPageList() {
  const list = $('#page-list');
  list.innerHTML = '';
  state.config.pages.forEach((page) => {
    const el = document.createElement('div');
    el.className = `page-item${page.id === state.config.activePageId ? ' active' : ''}`;
    el.innerHTML = `<span class="dot"></span><span class="name">${esc(page.name)}</span>`;
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
      btn.title = 'System panel — controlled by the deck firmware';
      btn.classList.add('system');
      grid.appendChild(btn);
      continue;
    }

    btn.draggable = true;
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
      state.selected = i;
      drawIndex(i);
      commit();
      renderInspector();
    });

    grid.appendChild(btn);
  }

  await drawGrid();
}

async function drawGrid() {
  const page = activePage();
  const tiles = [...$('#grid').children];
  await Promise.all(
    tiles.map((tile, i) => {
      if (i === WIDE_KEY_INDEX) return renderSystemPanel(tile.querySelector('canvas'));
      const key = effectiveKey(page.keys[i] || emptyKey());
      return renderKey(tile.querySelector('canvas'), key, 196, 196, autoIconFor(key));
    })
  );
}

function drawIndex(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  if (index === WIDE_KEY_INDEX) return renderSystemPanel(tile.querySelector('canvas'));
  const key = effectiveKey(activePage().keys[index] || emptyKey());
  renderKey(tile.querySelector('canvas'), key, 196, 196, autoIconFor(key));
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
  drawIndex(state.selected);
  commit();
  if (report) toast('Icon loaded from the site');
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
        plugin: key.action.plugin,
        action: key.action.action,
        key: keyIndexToSlot(Number(index)),
        settings: key.action.settings || {},
        active: page.id === state.config.activePageId,
      });
    }
  }
  api.syncPlugins(wanted).catch((err) => toast(err.message || String(err), true));
}

function schedulePush() {
  if (!state.status.connected || !state.config.settings.autoPush) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 400);
}

async function pushNow() {
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
    const res = await api.pushPage(images);
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

function addPage() {
  const page = {
    id: uuid(),
    name: `Page ${state.config.pages.length + 1}`,
    keys: {},
  };
  state.config.pages.push(page);
  state.config.activePageId = page.id;
  state.selected = null;
  renderAll();
  commit();
}

function deletePage(id) {
  if (state.config.pages.length <= 1) {
    toast('At least one page is required', true);
    return;
  }
  const page = state.config.pages.find((p) => p.id === id);
  if (!confirm(`Delete page “${page.name}”?`)) return;
  state.config.pages = state.config.pages.filter((p) => p.id !== id);
  if (state.config.activePageId === id) state.config.activePageId = state.config.pages[0].id;
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

