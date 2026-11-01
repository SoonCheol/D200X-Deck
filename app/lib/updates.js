'use strict';

// Update checks against the public GitHub releases page. This only reports a
// newer version and links to it; installing is left to the user for now.

const { normalizeVersion, isNewer } = require('./version');

const REPO = 'edufalcao/ulanzi-deck-open';
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const UA = 'Ulanzi-Deck-Open';

async function fetchLatestRelease({ fetchImpl = fetch, timeout = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(RELEASE_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    // A repository without releases answers 404.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub returned ${res.status} ${res.statusText || ''}`.trim());
    /** @type {any} */
    const release = await res.json();
    const version = normalizeVersion(release.tag_name || release.name || '');
    if (!version) throw new Error('The latest release has no version tag');
    return {
      version,
      url: release.html_url || `https://github.com/${REPO}/releases`,
      notes: String(release.body || ''),
      publishedAt: release.published_at || '',
      dmg: (release.assets || []).find((asset) => /\.dmg$/i.test(asset.name || ''))?.name || '',
    };
  } finally {
    clearTimeout(timer);
  }
}



// The release workflow appends download/quarantine instructions after a rule;
// they are not part of the changelog the user needs to read here.
function releaseNotes(body) {
  return String(body || '').split(/\n---\n/)[0].trim();
}

// Markdown is noisy in the update dialog, so flatten the parts we use. The
// dialog scrolls, so the full notes are kept unless a limit is requested.
function plainNotes(body, max = 0) {
  let text = releaseNotes(body)
    .replace(/^## Changes\s*/i, '')
    .replace(/^### (.*)$/gm, '$1')
    .replace(/^- /gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max > 0 && text.length > max) text = `${text.slice(0, max).trimEnd()}…`;
  return text;
}

module.exports = { REPO, fetchLatestRelease, isNewer, releaseNotes, plainNotes };
