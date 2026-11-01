'use strict';

// Import pages from Ulanzi Studio profiles.
//
// Formats handled:
//   - live profile directory:  .../ProfilesV2/<uuid>.ulanziProfile/
//   - exported file:           *.ulanziDeckProfile  ("#Version: 2\n" + ZIP)
//   - plain ZIP with a <uuid>.ulanziProfile/ folder inside
//
// Nothing here reads from the official .app bundle; icons are only taken from the
// profile itself or the user's Ulanzi data folder, and are copied into our config.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ULANZI_DIR = path.join(os.homedir(), 'Library/Application Support/Ulanzi/UlanziDeck');
const PROFILES_DIR = path.join(ULANZI_DIR, 'ProfilesV2');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------- hotkeys

const MOD_GLYPHS = [
  ['⌃', 'ctrl'],
  ['⌘', 'cmd'],
  ['⌥', 'alt'],
  ['⇧', 'shift'],
];

const KEY_NAMES = {
  return: 'return',
  enter: 'return',
  esc: 'escape',
  escape: 'escape',
  backspace: 'delete',
  delete: 'delete',
  tab: 'tab',
  space: 'space',
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
};

/** "⌃ ⌘ Q" → "ctrl+cmd+q". Returns null when the combo cannot be expressed. */
function convertHotkey(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  // Some profiles separate glyphs with several spaces (AU05).
  const parts = text.split(/\s+/).filter(Boolean);
  const mods = [];
  let keyToken = null;
  for (const part of parts) {
    let handled = false;
    for (const [glyph, token] of MOD_GLYPHS) {
      if (part.startsWith(glyph)) {
        mods.push(token);
        const rest = part.slice(glyph.length).trim();
        if (rest) keyToken = rest;
        handled = true;
        break;
      }
    }
    if (handled) continue;
    keyToken = part;
  }
  if (!keyToken) return null;
  const lower = keyToken.toLowerCase();
  if (lower === 'fn') return null;
  let key;
  if (/^f\d{1,2}$/.test(lower)) key = lower;
  else if (KEY_NAMES[lower]) key = KEY_NAMES[lower];
  else if (/^numpad\s*(\d)$/.test(lower)) key = `numpad${lower.match(/\d/)[1]}`;
  else if (lower.startsWith('num ')) {
    const map = { '*': 'numpadmultiply', '+': 'numpadplus', '-': 'numpadminus', '.': 'numpaddecimal', '/': 'numpaddivide', '=': 'numpadequal' };
    key = map[lower.slice(4)] || null;
  } else if (keyToken.length === 1) key = lower;
  else key = lower;
  if (!key) return null;
  const ordered = ['ctrl', 'cmd', 'alt', 'shift'].filter((m) => mods.includes(m));
  return [...ordered, key].join('+');
}

// ----------------------------------------------------------------- actions

const MULTIMEDIA = {
  play_pause: { type: 'media', op: 'playpause' },
  next_track: { type: 'media', op: 'next' },
  prev_track: { type: 'media', op: 'prev' },
  volume_mute: { type: 'media', op: 'mute' },
  volumn_mute: { type: 'media', op: 'mute' },
  volume_up: { type: 'media', op: 'volumeup' },
  volumn_up: { type: 'media', op: 'volumeup' },
  volume_down: { type: 'media', op: 'volumedown' },
  volumn_down: { type: 'media', op: 'volumedown' },
};

const SYSTEM_MEDIA_LABELS = {
  playpause: 'Play / pause',
  next: 'Next track',
  prev: 'Previous track',
  mute: 'Mute',
  volumeup: 'Volume up',
  volumedown: 'Volume down',
};

function fontColor(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  }
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return '#ffffff';
}

function fontWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 600;
  if (n >= 100) return Math.max(100, Math.min(900, Math.round(n / 100) * 100));
  if (n >= 10) return Math.max(100, Math.min(900, Math.round(n / 10) * 100));
  return 600;
}

/** Ulanzi's per-key Font object → our caption style. */
function mapFont(font) {
  if (!font || typeof font !== 'object') return null;
  const size = Math.max(10, Math.min(40, Math.round(Number(font.Size ?? font.FontSize) || 17)));
  return {
    size,
    weight: fontWeight(font.Weight),
    align: font.Align === 'center' ? 'center' : 'left',
    color: fontColor(font.Color),
    showLabel: font.ShowTitle !== false,
  };
}

function mapAction(entry, pageIds) {
  const uuid = String(entry.Action || '');
  const param = entry.ActionParam || {};
  const lower = uuid.toLowerCase();
  const plugin = entry.Plugin || {};

  // system
  if (lower.startsWith('com.ulanzi.ulanzideck.system.') || lower.startsWith('com.ulanzi.deck.system.')) {
    const kind = uuid.split('.').pop().toLowerCase();
    if (kind === 'open') return { action: { type: 'app', value: String(param.Path || '') }, label: null };
    if (kind === 'close') return { action: { type: 'close', value: String(param.Path || '') }, label: null };
    if (kind === 'website') return { action: { type: 'url', value: String(param.Url || param.URL || '') }, label: null };
    if (kind === 'text') {
      return { action: { type: 'text', value: String(param.Text || ''), enter: Boolean(param.Enter) }, label: 'Type text' };
    }
    if (kind === 'hotkey') {
      const value = convertHotkey(param.Hotkey);
      return value ? { action: { type: 'hotkey', value }, label: null } : { action: null, label: null, raw: entry };
    }
    if (kind === 'multimedia') {
      const key = String(param.Hotkey || '').toLowerCase();
      const mapped = MULTIMEDIA[key];
      if (mapped) return { action: mapped, label: SYSTEM_MEDIA_LABELS[mapped.op] };
      return { action: null, label: null, raw: entry };
    }
    return { action: null, label: null, raw: entry };
  }

  // pages
  if (lower.startsWith('com.ulanzi.ulanzideck.page.') || lower.startsWith('com.ulanzi.deck.page.')) {
    const kind = uuid.split('.').pop().toLowerCase();
    if (kind === 'next') return { action: { type: 'page', op: 'next' }, label: 'Next page' };
    if (kind === 'prev') return { action: { type: 'page', op: 'prev' }, label: 'Previous page' };
    if (kind === 'back') return { action: { type: 'page', op: 'back' }, label: 'Back' };
    if (kind === 'goto') {
      const target = param.PageUUID || param.PageId || param.Page || param.Value;
      if (target && pageIds.has(String(target))) {
        return { action: { type: 'page', op: 'goto', value: String(target) }, label: null };
      }
      return { action: null, label: null, raw: entry };
    }
    if (kind === 'folder') {
      const target = param.ProfileUUID || param.PageUUID;
      if (target && pageIds.has(String(target))) {
        return { action: { type: 'page', op: 'goto', value: String(target), folder: true }, label: null };
      }
      return { action: null, label: null, raw: entry };
    }
    if (kind === 'indicator') return { action: { type: 'indicator' }, label: '' };
    return { action: null, label: null, raw: entry };
  }

  // POP / action ring: a key that opens a small menu of child actions.
  if (lower === 'com.ulanzi.deck.popkey.pop' || lower.endsWith('.popkey.pop')) {
    const steps = (Array.isArray(param.Actions) ? param.Actions : [])
      .slice(0, 9)
      .map((child) => mapAction(child, pageIds).action)
      .filter(Boolean)
      .map((action) => ({ action }));
    if (!steps.length) return { action: null, label: null, raw: entry };
    return { action: { type: 'pop', steps }, label: 'POP menu' };
  }

  // soundboard
  if (lower.includes('sound.play')) {
    return {
      action: { type: 'sound', op: 'play', value: String(param.Value || param.File || ''), volume: Number(param.Volumn || param.Volume || 1) },
      label: 'Play audio',
    };
  }
  if (lower.includes('sound.stop')) return { action: { type: 'sound', op: 'stop', value: '' }, label: 'Stop audio' };

  // plugin
  if (plugin.UUID && !String(plugin.UUID).startsWith('com.ulanzi.deck.')) {
    return {
      action: {
        type: 'plugin',
        plugin: String(plugin.UUID),
        action: uuid,
        actionid: randomUUID(),
        settings: param,
      },
      label: null,
    };
  }

  return { action: null, label: null, raw: entry };
}

// ------------------------------------------------------------------ images

function readImage(baseDirs, candidates, warnings, budget = null) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    if (/^[A-Za-z]:[\\/]/.test(candidate)) continue; // Windows path
    const names = [candidate];
    // Absolute paths from another machine: try the same basename in known roots.
    if (path.isAbsolute(candidate)) names.push(path.basename(candidate));
    for (const name of names) {
      const paths = path.isAbsolute(name) ? [name] : baseDirs.map((dir) => path.join(dir, name));
      for (const file of paths) {
        try {
          const stat = fs.statSync(file);
          if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) continue;
          if (!IMAGE_EXT.has(path.extname(file).toLowerCase())) continue;
          const ext = path.extname(file).toLowerCase();
          const data = fs.readFileSync(file);
          if (budget) {
            budget.bytes -= data.length;
            if (budget.bytes < 0) throw new Error('This profile embeds more than 64 MB of images');
          }
          return `data:${MIME[ext] || 'image/png'};base64,${data.toString('base64')}`;
        } catch {
          /* try next */
        }
      }
    }
  }
  return null;
}

// -------------------------------------------------------------- discovery

function profileDirs() {
  const out = [];
  for (const base of [PROFILES_DIR, path.join(ULANZI_DIR, 'ProfilesV1')]) {
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.endsWith('.ulanziProfile')) {
          out.push(path.join(base, entry.name));
        }
      }
    } catch {
      /* directory missing */
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** List the profiles available on this Mac with their page names. */
function listProfiles() {
  const profiles = [];
  for (const dir of profileDirs()) {
    try {
      const manifest = readJson(path.join(dir, 'manifest.json'));
      const pages = Array.isArray(manifest.Pages?.Pages) ? manifest.Pages.Pages : [];
      const pageNames = [];
      for (const id of pages) {
        let name = '';
        try {
          name = String(readJson(path.join(dir, 'Profiles', id, 'manifest.json')).Name || '');
        } catch {
          /* page dir missing */
        }
        pageNames.push({ id: String(id), name });
      }
      profiles.push({
        id: path.basename(dir).replace(/\.ulanziProfile$/, ''),
        path: dir,
        name: manifest.Name || path.basename(dir),
        device: manifest.Device?.Model || '',
        pages: pageNames,
        current: manifest.Pages?.Current || pages[0],
      });
    } catch {
      /* not a profile */
    }
  }
  return profiles;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function extractProfileZip(file) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-import-'));
  let source = file;
  try {
    if (fs.statSync(file).size > MAX_ARCHIVE_BYTES) {
      throw new Error('This profile file is too large (max 256 MB)');
    }
    const head = fs.readFileSync(file, { encoding: 'latin1', flag: 'r' }).slice(0, 12);
    if (head.startsWith('#Version: 2')) {
      const data = fs.readFileSync(file).subarray(12);
      source = path.join(temp, 'profile.zip');
      fs.writeFileSync(source, data);
    }
    execFileSync('unzip', ['-oq', source, '-d', temp], { stdio: ['ignore', 'ignore', 'pipe'] });
    const dirs = [];
    const walk = (dir, depth = 0) => {
      if (depth > 2) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
        if (entry.name.endsWith('.ulanziProfile')) dirs.push(path.join(dir, entry.name));
        else walk(path.join(dir, entry.name), depth + 1);
      }
    };
    walk(temp);
    if (dirSize(temp) > MAX_ARCHIVE_BYTES) {
      throw new Error('This profile expands to more than 256 MB');
    }
    return { temp, dirs };
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw new Error(`Could not read the profile: ${err.message}`);
  }
}

// --------------------------------------------------------------- mapping

/**
 * Parse one profile directory into our pages.
 * @returns {{name:string, device:string, pages:Array, report:object}}
 */
function parseProfile(dir) {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const pageList = Array.isArray(manifest.Pages?.Pages) ? manifest.Pages.Pages : [];
  if (pageList.length > MAX_PAGES) {
    throw new Error(`This profile has too many pages (${pageList.length}, max ${MAX_PAGES})`);
  }
  const pageIds = new Set(pageList.map(String));
  const budget = { bytes: MAX_TOTAL_IMAGE_BYTES };
  const report = { skipped: [], unmapped: [], missingPlugins: [], warnings: [] };
  const pages = [];
  const folderNames = new Map();
  const folderParents = new Map();

  for (const pageId of pageList) {
    const pageDir = path.join(dir, 'Profiles', String(pageId));
    let pageManifest = {};
    try {
      pageManifest = readJson(path.join(pageDir, 'manifest.json'));
    } catch {
      report.warnings.push(`page ${pageId} has no manifest`);
      continue;
    }
    const controllers = pageManifest.Controllers;
    const keypad = Array.isArray(controllers)
      ? controllers.find((c) => c && c.Type === 'Keypad') || controllers[0]
      : controllers && typeof controllers === 'object' ? controllers : null;
    const actions = keypad?.Actions || {};
    const keys = {};

    for (const [slot, entry] of Object.entries(actions)) {
      if (slot === 'Icon' || slot === '3_2' || slot === '4_2') {
        report.skipped.push({ page: pageId, slot, reason: 'wide key (firmware panel)' });
        continue;
      }
      const match = /^(\d+)_(\d+)$/.exec(slot);
      if (!match) {
        report.skipped.push({ page: pageId, slot, reason: 'unsupported slot' });
        continue;
      }
      const index = Number(match[2]) * 5 + Number(match[1]);
      if (index > 12) {
        report.skipped.push({ page: pageId, slot, reason: 'outside the D200 grid' });
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;

      // Remember the label of folder keys so empty target pages get a name.
      if (/\.page\.folder$/i.test(String(entry.Action || ''))) {
        const target = entry.ActionParam?.ProfileUUID || entry.ActionParam?.PageUUID;
        const label = String(entry.ViewParam?.[0]?.Text || entry.Name || '').trim();
        if (target && label && !folderNames.has(String(target))) folderNames.set(String(target), label);
        if (target && pageIds.has(String(target))) folderParents.set(String(target), String(pageId));
      }

      const mapped = mapAction(entry, pageIds);
      const views = Array.isArray(entry.ViewParam) ? entry.ViewParam : [];
      const view = views[0] || {};
      const baseDirs = [pageDir, dir, path.join(dir, 'Images')];
      const icon = readImage(baseDirs, [view.Icon, view.IconRel, view.IconDef, entry.ActionParam?.Icon], report.warnings, budget);
      const font = mapFont(view.Font);

      // Multi-state keys: keep every state's icon/text so toggles look right.
      let states = null;
      if (views.length > 1) {
        states = views.map((stateView) => {
          const stateIcon = readImage(baseDirs, [stateView.Icon, stateView.IconRel, stateView.IconDef], report.warnings, budget);
          return {
            emoji: '',
            label: String(stateView.Text || '').slice(0, 40),
            ...(stateIcon ? { icon: stateIcon } : {}),
          };
        });
      }

      if (!mapped.action) {
        report.unmapped.push({ page: pageId, slot, action: String(entry.Action || ''), name: String(entry.Name || '') });
        keys[index] = {
          emoji: '❓',
          label: String(entry.Name || 'Unsupported').slice(0, 40),
          color: '#2a2f45',
          icon,
          action: { type: 'none' },
          sourceAction: { action: String(entry.Action || ''), param: entry.ActionParam || {}, plugin: entry.Plugin || {} },
        };
        continue;
      }
      if (mapped.action.type === 'plugin' && !mapped.action.plugin) {
        report.missingPlugins.push(mapped.action.plugin);
      }
      keys[index] = {
        emoji: '',
        label: mapped.action.type === 'indicator' ? '' : String(view.Text || '').slice(0, 40),
        color: '#1b2130',
        icon,
        iconSource: icon ? 'import' : '',
        action: mapped.action,
        ...(font ? { font } : {}),
        ...(states ? { states, stateIndex: Math.min(states.length - 1, Number(entry.State) || 0) } : {}),
      };
    }

    pages.push({
      id: String(pageId),
      name:
        String(pageManifest.Name || '').trim() ||
        folderNames.get(String(pageId)) ||
        `Page ${pages.length + 1}`,
      keys,
    });
  }

  for (const page of pages) {
    const parent = folderParents.get(page.id);
    if (parent && parent !== page.id) page.parentId = parent;
  }

  return {
    name: String(manifest.Name || 'Imported profile'),
    device: String(manifest.Device?.Model || ''),
    current: String(manifest.Pages?.Current || ''),
    pages,
    report,
  };
}

/** Map files or a directory, for the preview UI. */
function previewProfile(target) {
  const stat = fs.statSync(target);
  let cleanup = null;
  let dirs = [];
  if (stat.isDirectory()) dirs = [target];
  else {
    const extracted = extractProfileZip(target);
    cleanup = extracted.temp;
    dirs = extracted.dirs;
  }
  try {
    if (!dirs.length) throw new Error('No .ulanziProfile found in this file');
    const profiles = dirs.map(parseProfile);
    return { profiles, cleanup: cleanup || null };
  } catch (err) {
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
    throw err;
  }
}

module.exports = {
  listProfiles,
  parseProfile,
  previewProfile,
  convertHotkey,
  mapAction,
  PROFILES_DIR,
};
