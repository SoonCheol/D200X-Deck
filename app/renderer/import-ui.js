'use strict';

/* global $, api, confirmAction, esc, renderAll, state, syncPlugins, toast */

// "Import profile" modal: pick a live Ulanzi Studio profile (or a file), choose
// pages, and merge them into the current config. A Deck Open profile file is
// handed to importDeckOpenProfile in app.js instead.

let importSources = [];
let importActive = null;
let importPreview = null;
let importSelection = null;
let importCompleted = false;

function resetImportState() {
  importCompleted = false;
  const cancel = $('#import-cancel');
  if (cancel) cancel.textContent = 'Cancel';
  const run = $('#import-run');
  if (run) {
    run.textContent = 'Import';
    run.disabled = !(importSelection && importSelection.size);
  }
}

function markImportCompleted() {
  importCompleted = true;
  const cancel = $('#import-cancel');
  if (cancel) cancel.textContent = 'Close';
  const run = $('#import-run');
  if (run) {
    run.textContent = 'Imported';
    run.disabled = true;
  }
}

// The Mode row only matters once a profile is selected, and Choose file is the
// main action when there is nothing to pick from the list.
function syncImportChrome() {
  $('#import-mode-row').classList.toggle('hidden', !importPreview);
  $('#import-pick').classList.toggle('primary', importSources.length === 0);
}

function addImportFile(res) {
  const name = String(res.file || '').split('/').pop();
  const fromFile = (res.profiles || []).map((p) => ({ ...p, fromFile: name }));
  importSources = [...fromFile, ...importSources];
  renderImportSources();
  if (fromFile.length) selectImportSource(fromFile[0]);
}

function closeImportModal() {
  $('#import-modal').classList.add('hidden');
  importPreview = null;
  importSelection = null;
  resetImportState();
  syncImportChrome();
}

async function openImportModal() {
  $('#import-modal').classList.remove('hidden');
  window.focusModal?.('import-modal');
  $('#import-pages').innerHTML = '';
  $('#import-report').classList.add('hidden');
  resetImportState();
  $('#import-run').disabled = true;
  $('#import-sources').innerHTML = '<div class="insp-empty" style="padding:0">Scanning profiles…</div>';

  const res = await api.importScan();
  if (!res.ok) {
    $('#import-sources').innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    return;
  }
  importSources = res.profiles || [];
  importPreview = null;
  renderImportSources();
  if (importSources.length) selectImportSource(importSources[0]);
}

function renderImportSources() {
  const box = $('#import-sources');
  if (!importSources.length) {
    box.innerHTML =
      '<div class="insp-empty" style="padding:0">Ulanzi Studio is not installed or has no profiles yet. Choose a file to import.</div>';
    syncImportChrome();
    return;
  }
  const card = (p, i) => `<button class="import-source${p.path === importActive?.path ? ' active' : ''}" data-source="${i}">
        ${esc(p.name)}<small>${esc(p.fromFile ? `${p.fromFile} · ` : '')}${esc(p.device || 'unknown device')} · ${p.pages.length} page${p.pages.length === 1 ? '' : 's'}</small>
      </button>`;
  const group = (label, test) => {
    const rows = importSources.map((p, i) => (test(p) ? card(p, i) : '')).join('');
    return rows ? `<div class="import-group">${label}</div>${rows}` : '';
  };
  box.innerHTML =
    group('Ulanzi Studio on this Mac', (p) => !p.fromFile) + group('From file', (p) => Boolean(p.fromFile));
  box.querySelectorAll('[data-source]').forEach((btn) => {
    btn.addEventListener('click', () => selectImportSource(importSources[Number(btn.dataset.source)]));
  });
  syncImportChrome();
}

async function selectImportSource(source) {
  resetImportState();
  importActive = source;
  renderImportSources();
  $('#import-pages').innerHTML = '<div class="insp-empty" style="padding:0">Reading pages…</div>';
  const res = await api.importPreview(source.path);
  if (!res.ok) {
    $('#import-pages').innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    $('#import-run').disabled = true;
    importPreview = null;
    syncImportChrome();
    return;
  }
  importPreview = res.profiles?.[0] || null;
  if (!importPreview) {
    $('#import-pages').innerHTML = '<div class="insp-empty" style="padding:0">No pages in this profile.</div>';
    $('#import-run').disabled = true;
    syncImportChrome();
    return;
  }
  importSelection = new Set(importPreview.pages.map((p) => p.id));
  renderImportPages();
  $('#import-run').disabled = false;
  syncImportChrome();
}

function renderImportPages() {
  const box = $('#import-pages');
  if (!importPreview) return;
  box.innerHTML = importPreview.pages
    .map(
      (page) => `<label class="import-page">
        <input type="checkbox" data-page="${esc(page.id)}" ${importSelection.has(page.id) ? 'checked' : ''} />
        <span>${esc(page.name)}</span>
        <span class="count">${Object.keys(page.keys || {}).length} keys</span>
      </label>`
    )
    .join('');
  box.querySelectorAll('[data-page]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) importSelection.add(input.dataset.page);
      else importSelection.delete(input.dataset.page);
      if (importCompleted) resetImportState();
      $('#import-run').disabled = importSelection.size === 0;
    });
  });
}

async function runImport() {
  if (!importActive || !importSelection || !importSelection.size) return;
  const mode = $('#import-mode').value;
  if (mode === 'replace') {
    const ok = await confirmAction({
      title: 'Replace the current pages?',
      message: 'The imported pages replace every page in the current profile. This can’t be undone.',
      confirmLabel: 'Replace pages',
    });
    if (!ok) return;
  }
  const button = $('#import-run');
  const cancel = $('#import-cancel');
  button.disabled = true;
  button.textContent = 'Importing…';
  if (cancel) cancel.disabled = true;
  const res = await api.importApply({ target: importActive.path, pageIds: [...importSelection], mode });
  if (cancel) cancel.disabled = false;
  button.textContent = 'Import';
  button.disabled = false;
  if (!res.ok) return toast(res.error, true);

  const report = $('#import-report');
  report.classList.remove('hidden');
  const lists = [];
  if (res.unmapped?.length) {
    lists.push(
      `<div>Unsupported actions (kept as placeholders):</div><ul>${res.unmapped
        .slice(0, 8)
        .map((u) => `<li>${esc(u.name || u.action)} <span class="index">${esc(u.slot)}</span></li>`)
        .join('')}</ul>`
    );
  }
  if (res.missingPlugins?.length) {
    lists.push(`<div>Plugins not installed: ${res.missingPlugins.map(esc).join(', ')}</div>`);
  }
  if (res.warnings?.length) lists.push(`<div>${res.warnings.slice(0, 4).map(esc).join('<br/>')}</div>`);
  report.innerHTML = `<strong>Imported ${res.importedPages} page(s), ${res.importedKeys} key(s)${
    res.profileName ? ` into “${esc(res.profileName)}”` : ''
  }.</strong>${lists.join('') || ''}`;

  markImportCompleted();
  const boot = await api.getState();
  state.config = boot.config;
  state.status = boot.status;
  renderAll();
  syncPlugins();
  toast(`Imported ${res.importedPages} page(s)`);
}
