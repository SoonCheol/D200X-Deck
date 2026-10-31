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

function openPluginModal() {
  renderPluginModal();
  switchInstalledTab('plugins');
  $('#plugin-modal').classList.remove('hidden');
  window.focusModal?.('plugin-modal');
}

function closePluginModal() {
  $('#plugin-modal').classList.add('hidden');
}

function renderPluginModal() {
  const list = $('#plugin-list');
  if (!state.plugins.length) {
    list.innerHTML = `<div class="plugin-empty">
      No plugins found.<br/>
      Install a <b>.ulanziPlugin</b> folder or ZIP, or let the app scan Ulanzi Studio's plugin folder.
    </div>`;
    return;
  }

  list.innerHTML = state.plugins
    .map((p) => {
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
              <span class="badge-tag ${p.compatible ? 'good' : 'warn'}">${p.compatible ? 'Compatible' : 'Not supported'}</span>
              <span class="badge-tag ${p.writable ? 'good' : ''}" title="${
                p.writable ? 'Installed in this app' : 'Installed by Ulanzi Studio — read only'
              }">${p.writable ? 'Installed' : '🔒 Ulanzi'}</span>
            </div>
            <div class="plugin-sub">
              ${p.version ? `v${esc(p.version)} · ` : ''}${esc(p.author || 'unknown author')} · ${(p.actions || []).length} ${
                (p.actions || []).length === 1 ? 'action' : 'actions'
              }
            </div>
            <div class="plugin-badges">${actions}</div>
          </div>
          <div class="plugin-actions">
            <button class="btn ghost" data-reveal="${esc(p.uuid)}">Show in Finder</button>
            ${
              p.writable
                ? `<button class="btn danger" data-remove="${esc(p.uuid)}">Remove</button>`
                : `<button class="btn" data-import="${esc(p.uuid)}" title="Copy into this app so you can edit or remove it">Copy</button>`
            }
          </div>
        </div>`;
    })
    .join('');

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

