'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckProfileImport = factory();
})(globalThis, function () {
  /**
   * Build the profile/pages state for importing an own-format profile.
   * The caller supplies uuid/basename/remapKeys so this stays testable without a
   * DOM or a live config.
   * @returns {{profiles: object[], pages: object[], activeProfileId: string, activePageId: string, name: string, replaced: boolean, pageCount: number, profile: object}}
   */
  function planProfileImport(
    data,
    { profiles = [], pages = [], uuid = null, basename = null, remapKeys = null, replace = false } = {}
  ) {
    if (!data || data.format !== 'ulanzi-deck-open-profile' || !Array.isArray(data.pages) || !data.pages.length) {
      throw new Error('Not a valid Ulanzi Deck Open profile');
    }
    if (typeof uuid !== 'function' || typeof basename !== 'function' || typeof remapKeys !== 'function') {
      throw new Error('profile import requires uuid, basename and remapKeys');
    }

    const source = data.profile && typeof data.profile === 'object' ? data.profile : {};
    const wanted = String(source.name || data.name || 'Imported profile').trim() || 'Imported profile';
    const existing = replace
      ? profiles.find((p) => p.name.trim().toLowerCase() === wanted.toLowerCase())
      : null;
    let name = existing ? existing.name : wanted;
    if (!existing) {
      const taken = new Set(profiles.map((p) => p.name.trim().toLowerCase()));
      for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `${wanted} (${i})`;
    }

    const profileId = existing ? existing.id : uuid();
    const idMap = new Map();
    for (const page of data.pages) {
      if (!page || typeof page.id !== 'string') continue;
      if (idMap.has(page.id)) throw new Error('Profile has duplicate page ids');
      idMap.set(page.id, uuid());
    }

    const pageNames = new Set();
    const importedPages = [];
    for (const sourcePage of data.pages) {
      if (!sourcePage || typeof sourcePage !== 'object') continue;
      let pageName = String(sourcePage.name || 'Page').trim() || 'Page';
      for (let i = 2; pageNames.has(pageName.toLowerCase()); i += 1) pageName = `${sourcePage.name || 'Page'} (${i})`;
      pageNames.add(pageName.toLowerCase());
      const page = {
        id: idMap.get(sourcePage.id) || uuid(),
        name: pageName,
        profileId,
        keys: remapKeys(sourcePage.keys, idMap),
      };
      if (sourcePage.parentId && sourcePage.parentId !== sourcePage.id && idMap.has(sourcePage.parentId)) {
      page.parentId = idMap.get(sourcePage.parentId);
    }
      if (sourcePage.background) page.background = sourcePage.background;
      if (sourcePage.wideMode === 'stats' || sourcePage.wideMode === 'blank') page.wideMode = sourcePage.wideMode;
      if (page.parentId && Number(sourcePage.autoExitSeconds) > 0) {
        page.autoExitSeconds = Math.min(86_400, Math.max(1, Math.round(Number(sourcePage.autoExitSeconds))));
      }
      importedPages.push(page);
    }
    if (!importedPages.length) throw new Error('Profile has no usable pages');

    const profile = existing ? { ...existing, id: profileId, name } : { id: profileId, name };
    for (const field of ['icon', 'appPath', 'appName', 'background', 'pinned']) delete profile[field];
    if (typeof source.icon === 'string' && source.icon) profile.icon = source.icon;
    if (typeof source.appPath === 'string' && source.appPath) {
      profile.appPath = source.appPath;
      profile.appName = source.appName || basename(source.appPath);
    }
    if (source.background) profile.background = source.background;
    if (source.pinned && typeof source.pinned === 'object') {
      const pinned = remapKeys(source.pinned, idMap);
      if (Object.keys(pinned).length) profile.pinned = pinned;
    }

    const nextProfiles = existing
      ? profiles.map((p) => (p.id === profileId ? profile : p))
      : [...profiles, profile];
    const keptPages = existing ? pages.filter((p) => p.profileId !== profileId) : pages;
    return {
      profiles: nextProfiles,
      pages: [...keptPages, ...importedPages],
      activeProfileId: profileId,
      activePageId: importedPages[0].id,
      name,
      replaced: Boolean(existing),
      pageCount: importedPages.length,
      profile,
    };
  }

  return { planProfileImport };
});
