'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The official plugin market is the Ulanzi Studio community site. Its API needs
// an `authToken` header that the site gets from a normal account sign-in.
const WEB = 'https://ugc.ulanzistudio.com';
const BASE = `${WEB}/api/api`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

class StoreError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

class Market {
  constructor({ dir, language = 'en_US', appVersion = '0.1.0' } = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'store.json');
    this.language = language;
    this.appVersion = appVersion;
    this.token = null;
    this.user = null;
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.token = data.token || null;
      this.user = data.user || null;
    } catch {
      /* not signed in */
    }
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ token: this.token, user: this.user }, null, 2), {
      mode: 0o600,
    });
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* best effort */
    }
  }

  session() {
    return { signedIn: Boolean(this.token), user: this.user };
  }

  logout() {
    this.token = null;
    this.user = null;
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }

  async request(pathname, { params = {}, method = 'GET', form = null } = {}) {
    const url = new URL(BASE + pathname);
    const query = { ...params, lang: this.language, source: 'web' };
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    const headers = {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Origin: WEB,
      Referer: `${WEB}/`,
    };
    if (this.token) headers.authToken = this.token;

    let body;
    if (form) {
      body = new URLSearchParams(form).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    }

    const res = await fetch(url, { method, headers, body, redirect: 'follow' });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new StoreError(`Store returned an unexpected response (${res.status})`, res.status);
    }
    if (json.code && Number(json.code) !== 200) {
      throw new StoreError(json.message || json.msg || `Store error ${json.code}`, json.code);
    }
    return json;
  }

  async login(userName, password) {
    const json = await this.request('/login', { method: 'POST', form: { userName, password } });
    const token = typeof json.data === 'string' ? json.data : json.data?.token;
    if (!token) throw new StoreError('Ulanzi did not return a session token');
    this.token = token;
    this.user = userName;
    this.save();
    return this.session();
  }

  async categories() {
    const json = await this.request('/cateList');
    const list = Array.isArray(json.data) ? json.data : [];
    // Only the sections that make sense for a D200: profiles, plugins and icon packs.
    const allowed = new Set(['profile', 'plugins', 'lcons', 'icons']);
    return list
      .filter((c) => allowed.has(String(c.nameEn || c.nameCn || '').trim().toLowerCase()))
      .map((c) => {
        let name = c[`name${this.languageSuffix()}`] || c.nameEn || c.nameCn || String(c.id);
        // The store data spells "Icons" with a lowercase L.
        if (/^lcons$/i.test(name.trim())) name = 'Icons';
        return { id: c.id, name, raw: c };
      });
  }

  languageSuffix() {
    const lang = String(this.language || 'en_US').slice(0, 2).toLowerCase();
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  /** @returns {Promise<{items: object[], total: number}>} */
  async list({ page = 1, limit = 24, cateId = '', classify = 0, sort = '', isAsc = 'desc', searchText = '' } = {}) {
    const json = await this.request('/list', {
      params: {
        page,
        limit,
        cateId,
        excludeCateId: '',
        screen: '',
        sort,
        isAsc,
        orderByColumn: '',
        classify,
        searchText,
      },
    });
    const items = Array.isArray(json.data) ? json.data : json.data?.list || [];
    return { items: items.map((item) => normalizeItem(item)), total: Number(json.count || items.length) };
  }

  async resource(id) {
    const json = await this.request('/resources', { params: { id } });
    return normalizeItem(json.tResources || json.data || {});
  }

  /** Download a store resource file (usually a plugin ZIP) to a temp path. */
  async download(packageUrl, destPath) {
    if (!/^https?:\/\//i.test(String(packageUrl || ''))) {
      throw new StoreError('This plugin has no downloadable package');
    }
    const headers = { 'User-Agent': UA, Referer: `${WEB}/` };
    if (this.token) headers.authToken = this.token;
    const res = await fetch(packageUrl, { headers, redirect: 'follow' });
    if (!res.ok) throw new StoreError(`Download failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new StoreError('This store item is not a plugin package (not a ZIP file)');
    }
    fs.writeFileSync(destPath, buffer);
    return { path: destPath, size: buffer.length };
  }
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

const ASSET_BASE = WEB;

function absolute(url) {
  const value = String(url || '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  return `${ASSET_BASE}/${value.replace(/^\/+/, '')}`;
}

function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItem(raw) {
  const suffix = 'En';
  const files = absolute(pick(raw, ['files', 'file', 'fileUrl', 'downloadUrl'], ''));
  const banner = String(pick(raw, ['banner'], '')).split(',')[0];
  const cover = pick(raw, ['coverUrl'], '');
  const iconUrl = pick(raw, ['iconUrl'], '');
  // Some store rows use a bare file name for iconUrl (e.g. "Davinci Resolve.png")
  // which is not a real asset; those rows only have a banner image.
  const usableIcon = /^(\/|https?:)/i.test(iconUrl) ? iconUrl : '';
  return {
    id: String(pick(raw, ['id', 'resourceId'], '')),
    name: pick(raw, [`title${suffix}`, `productName${suffix}`, 'title', 'name', 'titleCn', 'productNameZh'], 'Untitled'),
    summary: pick(raw, [`overview${suffix}`, 'overview', `detailDesc${suffix}`, 'detailDesc', 'remark'], ''),
    icon: absolute(cover || banner || usableIcon || pick(raw, ['avatar'], '')),
    author: pick(raw, ['author', 'nickname', 'createBy'], ''),
    version: pick(raw, ['version', 'versionName', 'ver'], ''),
    uuid: pick(raw, ['uuid', 'pluginUuid'], ''),
    devices: pick(raw, ['device', 'support'], ''),
    downloads: Number(pick(raw, ['download', 'downloadCount', 'down'], 0)) || 0,
    stars: Number(pick(raw, ['star', 'collect', 'collectCount'], 0)) || 0,
    categoryId: pick(raw, ['cateId'], ''),
    classify: pick(raw, ['classify'], ''),
    updatedAt: pick(raw, ['updateTime', 'createTime'], ''),
    files,
    raw,
  };
}

module.exports = { Market, StoreError };
