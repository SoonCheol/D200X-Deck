'use strict';

// --------------------------------------------------------------- app picker

let appPickerKey = null;
let appPickerMode = 'key';
let appPickerTriggerPick = null;
const appIconCache = new Map();
const appIconQueue = [];
let appIconActive = 0;

function pumpAppIcons() {
  while (appIconActive < 4 && appIconQueue.length) {
    const { path, el } = appIconQueue.shift();
    appIconActive++;
    api
      .appIcon(path)
      .then((icon) => {
        appIconCache.set(path, icon);
        if (icon && el.isConnected) {
          const img = document.createElement('img');
          img.src = icon;
          img.alt = '';
          el.replaceChildren(img);
        }
      })
      .finally(() => {
        appIconActive--;
        pumpAppIcons();
      });
  }
}

function queueAppIcon(path, el) {
  if (!path || !el) return;
  if (appIconCache.has(path)) {
    const icon = appIconCache.get(path);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = '';
      el.replaceChildren(img);
    }
    return;
  }
  appIconQueue.push({ path, el });
  pumpAppIcons();
}

async function openAppPicker(mode = 'key', onTriggerPick = null) {
  appPickerMode = mode;
  appPickerTriggerPick = onTriggerPick;
  appPickerKey = mode === 'key' ? ensureKey(activePage(), state.selected) : null;
  if (!state.apps.length) state.apps = await api.listApps();
  $('#app-search').value = '';
  renderAppList('');
  $('#app-modal').classList.remove('hidden');
  setTimeout(() => $('#app-search').focus(), 40);
}

function closeAppPicker() {
  $('#app-modal').classList.add('hidden');
  appPickerKey = null;
  appPickerMode = 'key';
  appPickerTriggerPick = null;
}

function renderAppList(query) {
  const q = String(query || '').toLowerCase();
  const apps = state.apps.filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q)
  );
  const list = $('#app-list');
  if (!apps.length) {
    list.innerHTML = '<div class="plugin-empty">No applications found.</div>';
    return;
  }
  list.innerHTML = apps
    .map(
      (a) => `<button class="app-row" data-path="${esc(a.path)}" data-name="${esc(a.name)}">
        <div class="app-avatar" data-path="${esc(a.path)}">${esc((a.name[0] || 'A').toUpperCase())}</div>
        <div class="app-meta">
          <div class="app-name">${esc(a.name)}</div>
          <div class="app-path">${esc(a.path)}</div>
        </div>
      </button>`
    )
    .join('');
  list.querySelectorAll('.app-avatar').forEach((el) => queueAppIcon(el.dataset.path, el));
  list.querySelectorAll('.app-row').forEach((row) => {
    row.addEventListener('click', () => {
      if (appPickerMode === 'profile') {
        setProfileApp(row.dataset.path, row.dataset.name);
        closeAppPicker();
        return;
      }
      if (appPickerMode === 'trigger' && appPickerTriggerPick) {
        appPickerTriggerPick({ path: row.dataset.path, name: row.dataset.name });
        closeAppPicker();
        return;
      }
      const key = appPickerKey;
      if (!key) return;
      const index = state.selected;
      key.action = {
        type: key.action?.type === 'close' ? 'close' : 'app',
        value: row.dataset.path,
      };
      if (!key.emoji) key.emoji = row.dataset.name;
      syncActionMeta(key);
      commit();
      closeAppPicker();
      renderInspector();
      if (!key.icon) {
        api.appIcon(row.dataset.path).then((icon) => {
          if (!icon) return;
          key.icon = icon;
          key.iconSource = 'app';
          key.face = 'icon';
          delete key.iconCleared;
          if (state.selected === index) drawIndex(index);
          commit();
          renderInspector();
        });
      }
    });
  });
}


// ------------------------------------------------------------ plugin manager

function updatePluginCount() {
  $('#plugin-count').textContent = String(state.plugins.length);
}

async function refreshPlugins() {
  state.plugins = await api.listPlugins();
  updatePluginCount();
  if (!$('#plugin-modal').classList.contains('hidden')) renderPluginModal();
  syncPlugins();
}

function switchInstalledTab(tab) {
  const isIcons = tab === 'icons';
  $('#tab-plugins').classList.toggle('hidden', isIcons);
  $('#tab-icons').classList.toggle('hidden', !isIcons);
  $('#tab-plugins-btn').classList.toggle('active', !isIcons);
  $('#tab-icons-btn').classList.toggle('active', isIcons);
  if (isIcons) renderInstalledIcons();
}

const sdStore = { items: [], loading: false, query: '', updates: {} };

function installedSdPlugins() {
  const map = new Map();
  for (const plugin of state.plugins || []) {
    if (plugin.sdk !== 'streamdeck') continue;
    map.set(String(plugin.uuid || '').replace(/\.sdPlugin$/i, ''), plugin);
  }
  return map;
}

async function loadSdStore(force = false) {
  const list = $('#sdstore-list');
  if (!list || sdStore.loading) return;
  sdStore.loading = true;
  if (!sdStore.items.length || force) list.innerHTML = '<div class="plugin-empty">Loading Stream Deck catalogue…</div>';
  try {
    if (force || !sdStore.items.length) sdStore.items = await api.sdStoreList();
    const installed = installedSdPlugins();
    try {
      sdStore.updates = await api.sdStoreUpdates(
        [...installed.values()].map((plugin) => ({ uuid: plugin.uuid, version: plugin.version }))
      );
    } catch {
      sdStore.updates = {};
    }
  } catch (err) {
    list.innerHTML = `<div class="store-error">${esc(err.message || String(err))}</div>`;
    sdStore.loading = false;
    return;
  }
  sdStore.loading = false;
  renderSdStoreList();
}

function renderSdStoreList() {
  const list = $('#sdstore-list');
  if (!list) return;
  const query = sdStore.query.trim().toLowerCase();
  const installed = installedSdPlugins();
  const items = sdStore.items.filter((item) => {
    if (!query) return true;
    return [item.name, item.author, item.description, item.id].some((value) =>
      String(value || '').toLowerCase().includes(query)
    );
  });
  if (!items.length) {
    list.innerHTML = `<div class="plugin-empty">${
      query ? `No Stream Deck plugins match “${esc(sdStore.query)}”.` : 'No Stream Deck plugins found.'
    }</div>`;
    return;
  }
  list.innerHTML = items
    .map((item) => {
      const plugin = installed.get(item.id);
      const update = sdStore.updates[item.id];
      const latest = update || item.version || (plugin && plugin.version) || '';
      const canUpdate = Boolean(plugin && update);
      const label = !plugin ? 'Install' : canUpdate ? 'Update' : 'Installed';
      const disabled = plugin && !canUpdate;
      return `<div class="plugin-row">
        ${
          item.icon
            ? `<img class="plugin-icon" src="${esc(item.icon)}" alt="" loading="lazy" />`
            : '<div class="plugin-icon">🔌</div>'
        }
        <div class="plugin-meta">
          <div class="plugin-name">
            ${esc(item.name)}
            <span class="badge-tag">OpenAction</span>
            ${latest ? `<span class="badge-tag">v${esc(latest)}</span>` : ''}
            ${plugin ? '<span class="badge-tag good">Installed</span>' : ''}
          </div>
          <div class="plugin-sub">${esc(item.author || 'unknown author')}${item.description ? ` · ${esc(item.description)}` : ''}</div>
          <div class="plugin-badges"><span class="badge-tag">${esc(item.id)}</span></div>
        </div>
        <div class="plugin-actions">
          <button class="btn ${canUpdate || !plugin ? 'primary' : ''}" data-sd-install="${esc(item.id)}" ${
            disabled ? 'disabled' : ''
          }>${label}</button>
        </div>
      </div>`;
    })
    .join('');
  list.querySelectorAll('img.plugin-icon').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'plugin-icon';
      fallback.textContent = '🔌';
      img.replaceWith(fallback);
    });
  });
  list.querySelectorAll('[data-sd-install]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.sdInstall;
      button.disabled = true;
      button.textContent = 'Installing…';
      const res = await api.sdStoreInstall(id);
      if (!res.ok) {
        button.disabled = false;
        button.textContent = 'Install';
        return toast(res.error || 'Install failed', true);
      }
      state.plugins = res.list;
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      await loadSdStore(true);
      toast(`Installed ${res.name || id}`);
    });
  });
}

async function renderInstalledIcons() {
  const list = $('#icon-packs-list');
  list.innerHTML = '<div class="plugin-empty">Loading…</div>';
  const packs = await api.listIconPacks();
  if (!packs.length) {
    list.innerHTML = `<div class="plugin-empty">
      No icon packs installed in this app yet.<br/>
      Use <b>Get icon packs…</b> to download one from the store.
    </div>`;
    return;
  }
  list.innerHTML = packs
    .map(
      (pack) => `
      <div class="plugin-row">
        ${
          pack.icon
            ? `<img class="pack-icon" src="${esc(pack.icon)}" alt="" />`
            : '<div class="pack-icon"></div>'
        }
        <div class="plugin-meta">
          <div class="plugin-name">
            ${esc(pack.name)}
            <span class="badge-tag ${pack.readOnly ? '' : 'good'}">${pack.readOnly ? '🔒 Ulanzi' : 'Installed'}</span>
          </div>
          <div class="plugin-sub">${pack.files.length} ${pack.files.length === 1 ? 'icon' : 'icons'}${
            pack.readOnly ? ' · managed by Ulanzi Studio' : ''
          }</div>
        </div>
        <div class="plugin-actions">
          <button class="btn ghost" data-pack-use="${esc(pack.id)}">Use</button>
          ${
            pack.readOnly
              ? ''
              : `<button class="btn danger" data-pack-remove="${esc(pack.id)}">Delete</button>`
          }
        </div>
      </div>`
    )
    .join('');

  list.querySelectorAll('[data-pack-use]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pack = packs.find((p) => p.id === btn.dataset.packUse);
      closePluginModal();
      openIconLibrary(null);
      // preselect the pack
      setTimeout(() => {
        const target = [...document.querySelectorAll('.icons-pack')].find((b) => b.dataset.pack === pack?.id);
        target?.click();
      }, 300);
    });
  });

  list.querySelectorAll('[data-pack-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pack = packs.find((p) => p.id === btn.dataset.packRemove);
      if (!confirm(`Delete the icon pack “${pack?.name || ''}”?`)) return;
      const res = await api.removeIconPack(btn.dataset.packRemove);
      if (!res.ok) return toast(res.error, true);
      toast('Icon pack deleted');
      renderInstalledIcons();
    });
  });
}

function closePluginMenu() {
  $('#plugin-more-menu')?.classList.add('hidden');
  $('#plugin-more')?.setAttribute('aria-expanded', 'false');
}

function openPluginModal() {
  closePluginMenu();
  renderPluginModal();
  switchInstalledTab('plugins');
  $('#plugin-modal').classList.remove('hidden');
  window.focusModal?.('plugin-modal');
}

function closePluginModal() {
  closePluginMenu();
  $('#plugin-modal').classList.add('hidden');
}

function renderPluginModal() {
  const list = $('#plugin-list');
  if (!state.plugins.length) {
    list.innerHTML = `<div class="plugin-empty">
      No plugins found.<br/>
      Install a <b>.sdPlugin</b> / <b>.ulanziPlugin</b> folder or ZIP, or let the app scan the
      Ulanzi Studio, Elgato Stream Deck and OpenDeck plugin folders.
    </div>`;
    return;
  }

  const row = (p) => {
    const actions = (p.actions || [])
      .slice(0, 5)
      .map((a) => `<span class="badge-tag">${esc(a.name)}</span>`)
      .join('');
    return `
      <div class="plugin-row${p.compatible ? '' : ' disabled'}">
        ${p.icon ? `<img class="plugin-icon" src="${esc(p.icon)}" alt="" />` : `<div class="plugin-icon">🔌</div>`}
        <div class="plugin-meta">
          <div class="plugin-name">
            ${esc(p.name)}
            <span class="badge-tag ${p.compatible ? 'good' : 'warn'}"${p.compatReason ? ` title="${esc(p.compatReason)}"` : ''}>${
              p.compatible ? 'Compatible' : esc(p.compatReason || 'Not supported')
            }</span>
            <span class="badge-tag">${p.sdk === 'streamdeck' ? 'Stream Deck' : 'Ulanzi'}</span>
            <span class="badge-tag ${p.writable ? 'good' : ''}" title="${
              p.writable ? 'Installed in this app' : 'Read-only (installed by another app)'
            }">${p.writable ? 'Installed' : '🔒 Read-only'}</span>
          </div>
          <div class="plugin-sub">
            ${p.version ? `v${esc(p.version)} · ` : ''}${esc(p.author || 'unknown author')} · ${(p.actions || []).length} ${
              (p.actions || []).length === 1 ? 'action' : 'actions'
            }
          </div>
          <div class="plugin-badges">${actions}</div>
        </div>
        <div class="plugin-actions">
          <button class="btn ghost" data-reload="${esc(p.uuid)}" ${p.compatible ? '' : 'disabled'}>Reload</button>
          <button class="btn ghost" data-reveal="${esc(p.uuid)}">Show in Finder</button>
          ${
            p.compatReason === 'Needs Rosetta'
              ? `<button class="btn primary" data-rosetta="1" title="Opens Terminal and installs Rosetta">Install Rosetta…</button>`
              : ''
          }
          ${
            p.writable
              ? `<button class="btn danger" data-remove="${esc(p.uuid)}">Remove</button>`
              : `<button class="btn" data-import="${esc(p.uuid)}" title="Copy into this app so you can edit or remove it">Copy</button>`
          }
        </div>
      </div>`;
  };
  const groups = [
    ['Ulanzi', state.plugins.filter((p) => p.sdk !== 'streamdeck')],
    ['Stream Deck / OpenAction', state.plugins.filter((p) => p.sdk === 'streamdeck')],
  ].filter(([, plugins]) => plugins.length);
  list.innerHTML = groups
    .map(
      ([label, plugins]) =>
        `<div class="plugin-group">
          <div class="plugin-group-head">${esc(label)}<span>${plugins.length}</span></div>
          ${plugins.sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')}
        </div>`
    )
    .join('');

  list.querySelectorAll('[data-rosetta]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api.installRosetta();
      if (!res.ok) return toast(res.error || 'Could not open Terminal', true);
      toast('Install Rosetta in Terminal, then click Reload all');
    });
  });
  list.querySelectorAll('[data-reload]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api.restartPlugin(btn.dataset.reload);
      toast(res.ok ? 'Plugin reloaded' : res.error || 'Could not reload the plugin', !res.ok);
    });
  });
  list.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => api.revealPlugin(btn.dataset.reveal));
  });
  list.querySelectorAll('[data-import]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api.importPlugin(btn.dataset.import);
      if (!res.ok) return toast(res.error, true);
      state.plugins = res.list;
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      toast('Plugin copied — now managed by this app');
    });
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uuid = btn.dataset.remove;
      const plugin = state.plugins.find((p) => p.uuid === uuid);
      if (!confirm(`Remove “${plugin?.name || uuid}”?`)) return;
      const res = await api.removePlugin(uuid);
      if (!res.ok) return toast(res.error, true);
      state.plugins = res.list;
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      toast('Plugin removed');
    });
  });
}

