'use strict';

const { normalizeVersion, compareVersions } = require('./version');
const { readCapped } = require('./http');

// Catalogue metadata for Stream Deck / OpenAction plugins. This only fetches
// public indexes and GitHub release metadata; plugin packages are downloaded
// only when the user asks to install one.

// The OpenAction registry is the single catalogue. It lists one entry per plugin
// with its GitHub repository; versions are resolved from the latest release at
// install time, so the store never serves stale versions.
const CATALOGUE_URL = 'https://openactionapi.github.io/plugins/catalogue.json';
const MAX_DOWNLOAD = 128 * 1024 * 1024;
const UA = 'Ulanzi-Deck-Open';

/** @returns {Promise<any>} */
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = (await readCapped(res, 8 * 1024 * 1024, 'Catalogue')).toString('utf8');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

class StreamDeckCatalog {
  constructor() {
    this.items = null;
    this.loadedAt = 0;
    this.releases = new Map();
  }

  async list(force = false) {
    if (!force && this.items && Date.now() - this.loadedAt < 10 * 60_000) return this.items;
    const catalogue = await getJson(CATALOGUE_URL);
    if (!catalogue || typeof catalogue !== 'object' || Array.isArray(catalogue)) {
      throw new Error('Could not load the Stream Deck plugin catalogue');
    }
    const items = Object.entries(catalogue).map(([id, plugin]) => ({
      id,
      name: plugin.name || id,
      author: plugin.author || '',
      description: plugin.description || '',
      version: '',
      source: 'openaction',
      repository: plugin.repository || '',
      download: plugin.download_url || null,
      icon: plugin.icon || `https://openactionapi.github.io/plugins/icons/${encodeURIComponent(id)}.png`,
    }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    this.items = items;
    this.loadedAt = Date.now();
    return items;
  }

  async release(entry) {
    if (!entry.repository) throw new Error('This plugin has no repository');
    const cached = this.releases.get(entry.id);
    if (cached) return cached;
    const repo = entry.repository.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
    const release = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const asset = (release.assets || []).find((a) => /\.(zip|streamdeckplugin)$/i.test(a.name || ''));
    if (!asset) throw new Error('This plugin has no downloadable release asset');
    const resolved = {
      url: asset.browser_download_url,
      version: normalizeVersion(release.tag_name || release.name || ''),
    };
    this.releases.set(entry.id, resolved);
    return resolved;
  }

  async resolve(id) {
    const items = await this.list();
    const entry = items.find((item) => item.id === id);
    if (!entry) throw new Error('Plugin not found in the catalogue');
    const release = await this.release(entry);
    return { entry, url: entry.download || release.url, version: release.version || entry.version || '' };
  }

  async updates(installed) {
    const items = await this.list();
    const byId = new Map(items.map((item) => [item.id, item]));
    const updates = {};
    for (const plugin of installed || []) {
      const id = String(plugin.uuid || '').replace(/\.sdPlugin$/i, '');
      const entry = byId.get(id);
      if (!entry || !plugin.version) continue;
      let latest = entry.version;
      if (!latest) {
        try {
          latest = (await this.release(entry)).version;
        } catch {
          continue;
        }
      }
      if (latest && compareVersions(latest, plugin.version) > 0) {
        updates[id] = latest;
      }
    }
    return updates;
  }
}

async function download(url, dest) {
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('Only HTTPS plugin downloads are allowed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const length = Number(res.headers.get('content-length')) || 0;
    if (length > MAX_DOWNLOAD) throw new Error('Plugin package is too large');
    const data = await readCapped(res, MAX_DOWNLOAD, 'Plugin package');
    if (data.length > MAX_DOWNLOAD) throw new Error('Plugin package is too large');
    require('node:fs').writeFileSync(dest, data);
    return dest;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { StreamDeckCatalog, download, normalizeVersion, compareVersions };
