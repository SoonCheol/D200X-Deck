'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** Loopback, link-local, private, CGNAT, multicast and reserved IPv4 ranges. */
function isBlockedIp(ip) {
  const value = String(ip || '').trim();
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  if (net.isIPv6(value)) {
    const v = value.toLowerCase();
    if (v.startsWith('::ffff:')) return isBlockedIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return false;
}

/** Hostnames that must never be fetched from the main process. */
function isBlockedHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  return net.isIP(host) ? isBlockedIp(host) : false;
}

async function assertPublicUrl(url) {
  const parsed = url instanceof URL ? url : new URL(String(url));
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http(s) addresses can be fetched');
  if (isBlockedHost(parsed.hostname)) throw new Error('That address is not reachable from here');
  if (net.isIP(parsed.hostname)) return parsed;
  let addresses = [];
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve ${parsed.hostname}`);
  }
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error('That address is not reachable from here');
  }
  return parsed;
}

/**
 * Follow redirects by hand and re-check every hop. A public URL must not be
 * able to bounce the main process to 127.0.0.1 or a LAN address.
 */
async function safeFetch(url, options = {}, maxHops = 3) {
  let current = new URL(String(url));
  for (let hop = 0; hop <= maxHops; hop += 1) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...options, redirect: 'manual' });
    if (!REDIRECT_STATUS.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, current);
  }
  throw new Error('Too many redirects');
}

function normalize(raw) {
  let url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return new URL(url);
}

function dataUrl(buffer, type) {
  return `data:${type || 'image/png'};base64,${buffer.toString('base64')}`;
}

async function fetchImage(url, signal) {
  const res = await safeFetch(url, {
    signal,
    headers: { 'user-agent': UA, accept: 'image/*' },
  });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!type.startsWith('image/')) return null;
  const length = Number(res.headers.get('content-length') || 0);
  if (length > MAX_BYTES) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
  return { dataUrl: dataUrl(buffer, type), type, bytes: buffer.length, source: url };
}

function decodeEntities(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * Find the icon for one exact URL: direct image, <link rel="icon">, then
 * /favicon.ico relative to that URL. Returns { dataUrl, type, bytes, source }.
 */
async function iconFor(base) {
  const signal = AbortSignal.timeout(9000);

  // The URL itself may be an image.
  const direct = await fetchImage(base.href, signal);
  if (direct) return direct;

  const res = await safeFetch(base.href, {
    signal,
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`Site returned HTTP ${res.status}`);
  const html = (await res.text()).slice(0, 1_000_000);

  const candidates = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = (tag.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || !/icon/i.test(rel)) continue;
    let url;
    try {
      url = new URL(decodeEntities(href), base).href;
    } catch {
      continue;
    }
    const sizes = (tag.match(/sizes\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    let score = 0;
    if (/apple-touch-icon/i.test(rel)) score += 100;
    if (/\.svg(\?|$)/i.test(url)) score += 80;
    const size = sizes.match(/(\d+)x\d+/);
    if (size) score += Number(size[1]);
    candidates.push({ url, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates.slice(0, 8)) {
    const image = await fetchImage(candidate.url, signal);
    if (image) return image;
  }

  const favicon = await fetchImage(new URL('/favicon.ico', base).href, signal);
  if (favicon) return favicon;

  throw new Error('No icon found');
}

/**
 * Find a site's icon, falling back to the domain root when a deep page has no
 * icon of its own (e.g. github.com/org/repo → github.com/favicon.ico).
 */
async function fetchSiteIcon(rawUrl) {
  const base = normalize(rawUrl);
  try {
    return await iconFor(base);
  } catch (err) {
    const root = new URL('/', base);
    if (root.href === base.href) throw err;
    return iconFor(root);
  }
}

module.exports = { fetchSiteIcon, isBlockedIp, isBlockedHost };
