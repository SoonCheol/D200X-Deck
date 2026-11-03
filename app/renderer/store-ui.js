'use strict';

/* global $, activePage, api, commit, confirm, drawIndex, esc, loadSdStore, renderInspector, renderPluginModal, state, syncPlugins, toast, updatePluginCount */

// -------------------------------------------------------------- icon library

let iconLibraryPick = null;
let iconLibraryPacks = [];

function closeIconLibrary() {
  iconLibraryPick = null;
  $('#icons-modal').classList.add('hidden');
}

async function openIconLibrary(onPick = null) {
  iconLibraryPick = onPick;
  $('#icons-modal').classList.remove('hidden');
  window.focusModal?.('icons-modal');
  $('#icons-grid').innerHTML = '<div class="icons-empty">Loading…</div>';
  iconLibraryPacks = await api.listIconPacks();
  renderIconPacks();
}

function renderIconPacks() {
  const list = $('#icons-packs');
  $('#icons-modal')?.classList.toggle('icons-no-packs', !iconLibraryPacks.length);
  if (!iconLibraryPacks.length) {
    list.innerHTML = '';
    $('#icons-grid').innerHTML = `<div class="icons-empty">
        <div style="font-size:44px;margin-bottom:8px">🖼</div>
        <div style="margin-bottom:10px">No icon packs yet.</div>
        <button class="btn primary" id="icons-empty-store">Browse icon packs</button>
      </div>`;
    $('#icons-empty-store')?.addEventListener('click', () => {
      closeIconLibrary();
      openStoreModal('ulanzi-icons');
    });
    return;
  }
  list.innerHTML = iconLibraryPacks
    .map(
      (pack, index) =>
        `<button class="icons-pack${index === 0 ? ' active' : ''}" data-pack="${esc(pack.id)}">
           <span>${esc(pack.name)}</span><span class="count">${pack.files.length} ${pack.files.length === 1 ? 'icon' : 'icons'}</span>
         </button>`
    )
    .join('');
  list.querySelectorAll('[data-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('.icons-pack').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderIconGrid(iconLibraryPacks.find((p) => p.id === btn.dataset.pack));
    });
  });
  renderIconGrid(iconLibraryPacks[0]);
}

let iconLibraryQuery = '';

async function renderIconGrid(pack) {
  const grid = $('#icons-grid');
  if (!pack) return;
  grid.innerHTML = '<div class="icons-empty">Loading…</div>';
  const query = iconLibraryQuery.trim().toLowerCase();
  const files = query ? pack.files.filter((f) => f.toLowerCase().includes(query)) : pack.files;
  const tiles = [];
  for (const file of files) {
    const src = await api.readIcon(pack.id, file);
    if (src) tiles.push({ src, file });
  }
  grid.innerHTML = '';
  if (query && !files.length) {
    grid.innerHTML = `<div class="icons-empty">No icons match “${esc(iconLibraryQuery.trim())}”.</div>`;
    return;
  }
  for (const tile of tiles) {
    const btn = document.createElement('button');
    btn.className = 'icon-tile';
    btn.title = tile.file;
    btn.setAttribute('aria-label', tile.file
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()));
    const img = document.createElement('img');
    img.src = tile.src;
    img.alt = '';
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      if (iconLibraryPick) iconLibraryPick(tile.src, pack, tile.file);
      closeIconLibrary();
    });
    grid.appendChild(btn);
  }
  if (!tiles.length) grid.innerHTML = '<div class="icons-empty">This pack has no images.</div>';
}

/** Downscale a picked image to 392 px so key data stays small. */
function setKeyIconFromLibrary(src) {
  const key = activePage().keys[state.selected];
  if (!key) return;
  const img = new Image();
  img.onload = () => {
    const size = 392;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    key.icon = canvas.toDataURL('image/png');
    key.iconSource = 'library';
    key.face = 'icon';
    delete key.iconCleared;
    drawIndex(state.selected);
    commit();
    renderInspector();
    toast('Icon applied');
  };
  img.src = src;
}

// -------------------------------------------------------------- plugin store

const storeState = {
  session: { signedIn: false, user: null },
  categories: [],
  cateId: '',
  sort: 'hot',
  search: '',
  page: 1,
  items: [],
  total: 0,
  loading: false,
  detail: null,
  source: 'ulanzi-plugins',
};

function storeCategoryFor(source) {
  const pattern = source === 'ulanzi-icons' ? /^icons?$/i : /^plugins?$/i;
  return storeState.categories.find((c) => pattern.test(c.name) || (source === 'ulanzi-icons' ? c.name === '图标' : c.name === '插件'));
}

function renderStoreSourceTabs() {
  document.querySelectorAll('[data-store-source]').forEach((btn) => {
    const active = btn.dataset.storeSource === storeState.source;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

async function selectStoreSource(source) {
  storeState.source = source;
  renderStoreSourceTabs();
  $('#store-detail').classList.add('hidden');
  document.querySelector('.store-card')?.classList.remove('detail-mode');
  if (source === 'sd-plugins') {
    $('#store-signin').classList.add('hidden');
    $('#store-browse').classList.add('hidden');
    $('#store-sd').classList.remove('hidden');
    $('#store-sub').textContent = 'Stream Deck / OpenAction plugins from public catalogues.';
    $('#store-user').classList.add('hidden');
    $('#store-logout').classList.add('hidden');
    await loadSdStore();
    return;
  }
  $('#store-sd').classList.add('hidden');
  $('#store-browse').classList.remove('hidden');
  $('#store-signin').classList.add('hidden');
  const category = storeCategoryFor(source);
  if (category) storeState.cateId = category.id;
  storeState.search = '';
  const search = $('#store-search');
  if (search) search.value = '';
  $('#store-user').classList.toggle('hidden', !storeState.session.signedIn);
  $('#store-user').textContent = storeState.session.user || '';
  $('#store-logout').classList.toggle('hidden', !storeState.session.signedIn);
  $('#store-sub').textContent = source === 'ulanzi-icons' ? 'Ulanzi marketplace · Icons' : 'Ulanzi marketplace · Plugins';
  await loadStoreItems(true);
}

async function openStoreModal(source = 'ulanzi-plugins') {
  $('#store-modal').classList.remove('hidden');
  window.focusModal?.('store-modal');
  $('#store-detail').classList.add('hidden');
  const session = await api.storeSession();
  storeState.session = session;
  await loadStoreCategories();
  await selectStoreSource(source);
}

function closeStoreModal() {
  $('#store-modal').classList.add('hidden');
  $('#store-detail').classList.add('hidden');
}

function renderStoreChrome(requireSignIn = false) {
  if (storeState.source === 'sd-plugins') {
    $('#store-signin').classList.add('hidden');
    $('#store-browse').classList.add('hidden');
    $('#store-sd').classList.remove('hidden');
    return;
  }
  $('#store-signin').classList.toggle('hidden', !requireSignIn);
  $('#store-browse').classList.toggle('hidden', requireSignIn);
  $('#store-sd').classList.add('hidden');
  $('#store-user').classList.toggle('hidden', !storeState.session.signedIn);
  $('#store-user').textContent = storeState.session.user || '';
  $('#store-logout').classList.toggle('hidden', !storeState.session.signedIn);
}

async function loadStoreCategories() {
  const res = await api.storeCategories();
  if (!res.ok) {
    $('#store-cats').innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    return;
  }
  // Profiles are listed by the store but cannot be installed yet — keep the
  // marketplace focused on things this app can actually use.
  storeState.categories = (res.categories || []).filter((c) => !/^profiles?$/i.test(c.name));
  $('#store-cats').classList.add('hidden');
  renderStoreCategories();
}

function renderStoreCategories() {
  const cats = [...storeState.categories];
  $('#store-cats').innerHTML = cats
    .map(
      (c) =>
        `<button class="store-cat${String(c.id) === String(storeState.cateId) ? ' active' : ''}" data-cat="${esc(
          c.id
        )}">${esc(c.name)}</button>`
    )
    .join('');
  $('#store-cats')
    .querySelectorAll('[data-cat]')
    .forEach((btn) =>
      btn.addEventListener('click', () => {
        storeState.cateId = btn.dataset.cat;
        renderStoreCategories();
        loadStoreItems(true);
      })
    );
}

async function loadStoreItems(reset = false) {
  if (storeState.loading) return;
  storeState.loading = true;
  if (reset) {
    storeState.page = 1;
    storeState.items = [];
    $('#store-grid').innerHTML = '<div class="store-empty">Loading…</div>';
  }
  const res = await api.storeList({
    page: storeState.page,
    limit: 24,
    cateId: storeState.cateId,
    sort: storeState.sort,
    isAsc: 'asc',
    searchText: storeState.search,
  });
  storeState.loading = false;
  if (!res.ok) {
    $('#store-grid').innerHTML = `<div class="store-empty">${esc(res.error)}</div>`;
    if (/token/i.test(res.error || '')) {
      renderStoreChrome(false);
    }
    return;
  }
  storeState.items = reset ? res.items : [...storeState.items, ...res.items];
  storeState.total = res.total || storeState.items.length;
  renderStoreGrid();
}

function renderStoreGrid() {
  const grid = $('#store-grid');
  const query = storeState.search.trim();
  if (!storeState.items.length) {
    grid.innerHTML = `<div class="store-empty">${
      query ? `No plugins match “${esc(query)}”.` : 'No plugins found.'
    }${
      query ? '<button class="btn small" id="store-clear-search">Clear search</button>' : ''
    }</div>`;
    const clear = $('#store-clear-search');
    if (clear) {
      clear.addEventListener('click', () => {
        storeState.search = '';
        const input = $('#store-search');
        if (input) input.value = '';
        loadStoreItems(true);
      });
    }
  } else {
    grid.innerHTML = storeState.items
      .map((item) => {
        const installed = state.plugins.find(
          (p) => (item.uuid && p.uuid === item.uuid) || p.name === item.name
        );
        const updatable =
          installed &&
          item.version &&
          typeof DeckVersion !== 'undefined' &&
          DeckVersion.compareVersions(item.version, installed.version || '0') > 0;
        return `
        <button class="store-item" data-id="${esc(item.id)}">
          ${
            item.icon
              ? `<img class="store-thumb" src="${esc(item.icon)}" data-fallback="${esc(
                  (item.screenshots || []).find((src) => src !== item.icon) || ''
                )}" alt="" loading="lazy" />`
              : '<div class="store-thumb empty">🧩</div>'
          }
          <div class="store-item-name">${esc(item.name)}${
            installed
              ? `<span class="badge-tag ${updatable ? 'warn' : 'good'}" style="margin-left:6px">${
                  updatable ? 'Update' : 'Installed'
                }</span>`
              : ''
          }</div>
          <div class="store-item-meta"><span>${esc(item.author || 'Ulanzi')}</span><span>${
            item.version ? `v${esc(item.version)}` : ''
          }</span></div>
        </button>`;
      })
      .join('');
    grid.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => openStoreDetail(btn.dataset.id));
    });
  }
  attachImageFallbacks(grid);
  $('#store-count').textContent = storeState.items.length ? `${storeState.items.length} of ${storeState.total}` : '';
  const cat = storeState.categories.find((c) => String(c.id) === String(storeState.cateId));
  const kind = /icons?/i.test(cat?.name || '') ? 'icons' : 'plugins';
  const searchEl = $('#store-search');
  if (searchEl) searchEl.placeholder = `Search ${kind}…`;
  const sub = $('#store-sub');
  if (sub) sub.textContent = cat ? `Ulanzi marketplace · ${cat.name}` : 'Ulanzi marketplace';
  $('#store-more').classList.toggle('hidden', storeState.items.length >= storeState.total);
}

function formatCount(n) {
  const value = Number(n) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 || size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

/** Fall back to another store image when a cover URL is stale. */
function attachImageFallbacks(root) {
  root.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallback;
      if (fallback && img.src !== fallback) {
        img.dataset.fallback = '';
        img.src = fallback;
        return;
      }
      const placeholder = document.createElement('div');
      placeholder.className = img.classList.contains('store-detail-icon')
        ? 'store-thumb empty store-detail-icon'
        : 'store-thumb empty';
      placeholder.textContent = '🧩';
      img.replaceWith(placeholder);
    });
  });
}

async function openStoreDetail(id) {
  const detail = $('#store-detail');
  document.querySelector('.store-card')?.classList.add('detail-mode');
  $('#store-browse').classList.add('hidden');
  detail.classList.remove('hidden');
  detail.innerHTML = '<div class="store-empty">Loading…</div>';
  const res = await api.storeResource(id);
  if (!res.ok) {
    detail.innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    return;
  }
  const item = res.resource;
  storeState.detail = item;
  const installedPlugin = state.plugins.find(
    (p) => (item.uuid && p.uuid === item.uuid) || p.name === item.name
  );
  const installed = Boolean(installedPlugin);
  const updatable =
    installed && item.version && DeckVersion.compareVersions(item.version, installedPlugin.version || '0') > 0;
  const category = storeState.categories.find((c) => String(c.id) === String(item.categoryId));
  const kind = category?.name || '';
  const installable = /plugins?/i.test(kind) && /\.zip$/i.test(item.files || '');
  const iconPack = /icons?/i.test(kind) && /\.zip$/i.test(item.files || '');
  const pluginKind = /plugins?/i.test(kind);
  const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];
  const longText = item.longDescription || '';
  const summary = item.summary || '';
  const lead = longText && summary && summary !== longText ? summary : '';
  const body = longText || summary || 'No description provided.';
  const stateBadge = `<span class="badge-tag ${
    installed ? (updatable ? 'warn' : 'good') : 'hidden'
  }" id="store-install-state">${updatable ? 'Update available' : 'Installed'}</span>`;
  detail.innerHTML = `
    <div class="store-detail-bar">
      <button class="btn ghost store-back-top" id="store-back">← Back</button>
    </div>
    <div class="store-detail-head">
      ${
        item.icon
          ? `<img class="store-detail-icon" src="${esc(item.icon)}" data-fallback="${esc(
              screenshots.find((src) => src !== item.icon) || ''
            )}" alt="" />`
          : '<div class="store-thumb empty store-detail-icon">🧩</div>'
      }
      <div>
        <h3>${esc(item.name)}</h3>
        <div class="store-detail-sub">
          ${esc(item.author || 'Ulanzi')}${item.version ? ` · v${esc(item.version)}` : ''}
        </div>
        <div class="store-detail-meta">
          ${stateBadge}
          <span class="badge-tag">${esc(kind || 'Item')}</span>
          ${
            installed && installedPlugin.version
              ? `<span id="store-installed-version">Installed v${esc(installedPlugin.version)}</span>`
              : '<span id="store-installed-version" class="hidden"></span>'
          }
          <span id="store-detail-size"></span>
          ${item.downloads ? `<span>${formatCount(item.downloads)} downloads</span>` : ''}
          ${item.stars ? `<span>${formatCount(item.stars)} stars</span>` : ''}
        </div>
      </div>
    </div>
    ${
      screenshots.length
        ? `<div class="store-shots">
            <img class="store-shot" id="store-shot" src="${esc(screenshots[0])}" alt="${esc(item.name)} screenshot" />
            ${
              screenshots.length > 1
                ? `<div class="store-shot-strip">${screenshots
                    .map(
                      (src, index) =>
                        `<button class="store-shot-thumb${index === 0 ? ' active' : ''}" type="button" data-shot="${esc(
                          src
                        )}" aria-label="Screenshot ${index + 1}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`
                    )
                    .join('')}</div>`
                : ''
            }
          </div>`
        : ''
    }
    <div class="store-detail-actions">
      ${
        installable
          ? `<button class="btn primary" id="store-install" ${installed && !updatable ? 'disabled' : ''}>
               ${updatable ? 'Update plugin' : installed ? 'Installed' : 'Install plugin'}
             </button>`
          : iconPack
            ? '<button class="btn primary" id="store-download-icons">Download icons</button>'
            : pluginKind
              ? '<span class="badge-tag">No download</span>'
              : '<span class="badge-tag">Not a plugin</span>'
      }
    </div>
    ${
      installable || iconPack
        ? ''
        : `<p class="store-note">${
            pluginKind && !item.files
              ? 'This plugin listing has no downloadable package on the Ulanzi store.'
              : /icons?/i.test(kind) && !item.files
                ? 'This icon pack has no downloadable file on the Ulanzi store.'
                : `${kind ? `${esc(kind)}` : 'This item'} can be downloaded from the Ulanzi marketplace, but only JavaScript <b>plugins</b> and <b>icon packs</b> can be installed into this app.`
          }</p>`
    }
    ${lead ? `<p class="store-detail-lead">${esc(lead)}</p>` : ''}
    <p class="store-detail-desc">${esc(body)}</p>
    ${
      item.uuid
        ? `<details class="store-detail-id"><summary>Plugin ID</summary><code>${esc(item.uuid)}</code></details>`
        : ''
    }
  `;
  attachImageFallbacks(detail);
  detail.querySelectorAll('[data-shot]').forEach((button) => {
    button.addEventListener('click', () => {
      const shot = $('#store-shot');
      if (!shot) return;
      shot.src = button.dataset.shot;
      detail.querySelectorAll('[data-shot]').forEach((other) => other.classList.toggle('active', other === button));
    });
  });
  $('#store-back').addEventListener('click', () => {
    detail.classList.add('hidden');
    document.querySelector('.store-card')?.classList.remove('detail-mode');
    $('#store-browse').classList.remove('hidden');
  });
  const downloadIcons = $('#store-download-icons');
  if (downloadIcons) {
    downloadIcons.addEventListener('click', async () => {
      downloadIcons.disabled = true;
      downloadIcons.textContent = 'Downloading…';
      const bar = document.createElement('div');
      bar.className = 'download-bar';
      bar.innerHTML = '<span></span>';
      detail.querySelector('.store-detail-actions')?.after(bar);
      const out = await api.installIconPack(item.id);
      if (!out.ok) {
        downloadIcons.disabled = false;
        downloadIcons.textContent = 'Download icons';
        return toast(out.error, true);
      }
      bar.remove();
      toast(`Added ${out.pack.count} icons to your library`);
      closeStoreModal();
      openIconLibrary((src) => setKeyIconFromLibrary(src));
      downloadIcons.disabled = false;
      downloadIcons.textContent = 'Download icons';
    });
  }
  // Ask the CDN whether the package still exists and how large it is before
  // offering a download.
  const actionBtn = $('#store-install') || $('#store-download-icons');
  if (actionBtn && (!installed || updatable) && !actionBtn.disabled) {
    const readyLabel = actionBtn.textContent;
    actionBtn.disabled = true;
    actionBtn.textContent = 'Checking…';
    api.storeCheckFile(item.id).then((check) => {
      actionBtn.textContent = readyLabel;
      if (check.ok) {
        actionBtn.disabled = false;
        const size = $('#store-detail-size');
        if (size && check.size) size.textContent = formatBytes(check.size);
        return;
      }
      actionBtn.disabled = true;
      actionBtn.textContent = 'Unavailable';
      const note = document.createElement('p');
      note.className = 'store-note';
      note.textContent =
        'Ulanzi’s file for this item is missing from their server, so it cannot be downloaded right now.';
      detail.querySelector('.store-detail-actions').after(note);
    });
  }

  const install = $('#store-install');
  if (install && (!installed || updatable)) {
    const label = updatable ? 'Update plugin' : 'Install plugin';
    install.addEventListener('click', async () => {
      const ok = confirm(
        `${updatable ? 'Update' : 'Install'} “${item.name}”?\n\nPlugins run on your Mac with your user permissions, outside the app sandbox. Only install plugins you trust.`
      );
      if (!ok) return;
      install.disabled = true;
      install.textContent = 'Installing…';
      const out = await api.storeInstall(item.id);
      if (!out.ok) {
        install.disabled = false;
        install.textContent = label;
        return toast(out.error, true);
      }
      state.plugins = out.list || (await api.listPlugins());
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      install.textContent = 'Installed';
      install.disabled = true;
      const stateBadgeEl = $('#store-install-state');
      if (stateBadgeEl) {
        stateBadgeEl.textContent = 'Installed';
        stateBadgeEl.classList.remove('warn', 'hidden');
        stateBadgeEl.classList.add('good');
      }
      const updated = state.plugins.find(
        (p) => (item.uuid && p.uuid === item.uuid) || p.name === item.name
      );
      const versionEl = $('#store-installed-version');
      if (versionEl) {
        if (updated?.version) {
          versionEl.textContent = `Installed v${updated.version}`;
          versionEl.classList.remove('hidden');
        } else {
          versionEl.classList.add('hidden');
        }
      }
      toast(`${updatable ? 'Updated' : 'Installed'} ${out.name || item.name}`);
    });
  }
}

