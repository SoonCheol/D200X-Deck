'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckUrlSafety = factory();
})(globalThis, function () {
  // App-link schemes we open without a prompt. Everything else asks once.
  const KNOWN_SCHEMES = new Set([
    'http',
    'https',
    'mailto',
    'slack',
    'zoommtg',
    'linear',
    'obsidian',
    'notion',
    'vscode',
    'cursor',
    'figma',
    'spotify',
    'discord',
    'telegram',
    'whatsapp',
    'msteams',
    'ms-outlook',
  ]);

  // These must never be handed to the OS protocol handler.
  const BLOCKED_SCHEMES = new Set([
    'file',
    'javascript',
    'data',
    'vbscript',
    'about',
    'blob',
    'chrome',
    'chrome-extension',
    'view-source',
    'shortcuts',
    'x-apple.systempreferences',
    'smb',
    'afp',
    'ssh',
    'ms-msdt',
    'search-ms',
    'devtools',
  ]);

  /** Lower-case scheme, or '' when the value has no scheme. */
  function schemeOf(value) {
    const match = /^([a-z][a-z0-9+.-]*):/i.exec(String(value || '').trim());
    return match ? match[1].toLowerCase() : '';
  }

  function hasControlCharacters(value) {
    return /[\u0000-\u001f\u007f]/.test(String(value || ''));
  }

  function isBlockedScheme(scheme) {
    return BLOCKED_SCHEMES.has(String(scheme || '').toLowerCase());
  }

  function isKnownScheme(scheme) {
    return KNOWN_SCHEMES.has(String(scheme || '').toLowerCase());
  }

  return { schemeOf, hasControlCharacters, isBlockedScheme, isKnownScheme };
});
