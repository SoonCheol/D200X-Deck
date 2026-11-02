'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readCapped } = require('./http');

// The official plugin market is the Ulanzi Studio community site. Its API needs
// an `authToken` header that the site gets from a normal account sign-in.
const WEB = 'https://ugc.ulanzistudio.com';
const BASE = `${WEB}/api/api`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;

function isVendorHost(hostname) {
  return /(^|\.)ulanzistudio\.com$/i.test(String(hostname || ''));
}

class StoreError extends Error {
  /**
   * @param {string} message
   * @param {string|number} [code]
   */
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * Follow redirects by hand so the session token is only ever sent to a host
 * the vendor owns. `fetch(..., { redirect: 'follow' })` would forward the
 * Authorization-style header to whatever host a 307/308 points at.
 */
/**
 * @param {URL|string} url
 * @param {any} [options]
 * @param {number} [maxHops]
 */
async function fetchFollowing(url, options = {}, maxHops = 5) {
  let current = new URL(String(url));
  let request = { ...options };
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (!/^https?:$/.test(current.protocol)) {
      throw new StoreError('The store redirected to an unsupported address');
    }
    const headers = { ...(request.headers || {}) };
    if (headers.authToken && !isVendorHost(current.hostname)) delete headers.authToken;
    const res = await fetch(current, { ...request, headers, redirect: 'manual' });
    if (!REDIRECT_STATUS.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, current);
    const toGet =
      res.status === 303 || ((res.status === 301 || res.status === 302) && request.method === 'POST');
    if (toGet) {
      const nextHeaders = { ...headers };
      delete nextHeaders['Content-Type'];
      request = { ...request, method: 'GET', body: undefined, headers: nextHeaders };
    }
  }
  throw new StoreError('The store redirected too many times');
}

class Market {
  /**
   * @param {{ dir: string, language?: string, appVersion?: string }} options
   */
  constructor({ dir, language = 'en_US', appVersion = '0.1.0' }) {
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
    if (this.token && isVendorHost(url.hostname)) headers.authToken = this.token;

    let body;
    if (form) {
      body = new URLSearchParams(form).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    }

    const res = await fetchFollowing(url, { method, headers, body, signal: AbortSignal.timeout(20_000) });
    const text = (await readCapped(res, 8 * 1024 * 1024, 'Store response')).toString('utf8');
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

  /** HEAD the package file to see whether Ulanzi's CDN still has it. */
  async checkFile(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, reason: 'missing' };
    const headers = { 'User-Agent': UA, Referer: `${WEB}/` };
    if (this.token && isVendorHost(new URL(url).hostname)) headers.authToken = this.token;
    try {
      const res = await fetchFollowing(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(15_000) });
      const type = String(res.headers.get('content-type') || '');
      const size = Number(res.headers.get('content-length') || 0);
      const ok = res.ok && !/html|xml/i.test(type);
      return { ok, status: res.status, contentType: type, size };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
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
    if (this.token && isVendorHost(new URL(packageUrl).hostname)) headers.authToken = this.token;
    const res = await fetchFollowing(packageUrl, { headers });
    if (!res.ok) throw new StoreError(`Download failed (${res.status})`);
    const buffer = await readCapped(res, MAX_PACKAGE_BYTES, 'This package');
    if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      const type = String(res.headers.get('content-type') || '');
      if (!res.ok || /html|xml/i.test(type)) {
        throw new StoreError(
          'Ulanzi no longer has this file on their server (the download link is broken).'
        );
      }
      throw new StoreError('This item is not a ZIP file, so it cannot be installed.');
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
    summary: plainText(pick(raw, [`overview${suffix}`, 'overview', `detailDesc${suffix}`, 'detailDesc', 'remark'], '')),
    icon: absolute(cover || banner || usableIcon || pick(raw, ['avatar'], '')),
    author: pick(raw, ['author', 'nickname', 'createBy'], ''),
    version: pick(raw, ['version', 'versionName', 'ver'], ''),
    uuid: pick(raw, ['uuid', 'pluginUuid'], ''),
    devices: pick(raw, ['device', 'support'], ''),
    downloads: Number(pick(raw, ['download', 'downloadCount', 'down'], '0')) || 0,
    stars: Number(pick(raw, ['star', 'collect', 'collectCount'], '0')) || 0,
    categoryId: pick(raw, ['cateId'], ''),
    classify: pick(raw, ['classify'], ''),
    updatedAt: pick(raw, ['updateTime', 'createTime'], ''),
    files,
    raw,
  };
}

module.exports = { Market, StoreError };
