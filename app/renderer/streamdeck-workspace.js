'use strict';

// Stream Deck 7.6.1-inspired desktop layout for the Windows D200X editor.
// Reparent existing controls instead of recreating them: their event handlers,
// state, persistence and plugin/action IDs continue to work unchanged.
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const sidebar = $('.sidebar');
  const toolbar = $('.toolbar');
  const identity = $('.brand');
  const profile = $('.profile-row');
  const titleWrap = $('.title-wrap', toolbar);
  const stage = $('.stage');
  const pageList = $('#page-list');
  const pageHeading = pageList?.previousElementSibling;
  const library = $('#action-library');
  const pluginNav = $('.sidebar-nav');
  if (!sidebar || !toolbar || !identity || !profile || !titleWrap ||
      !stage || !pageList || !pageHeading || !library || !pluginNav) return;

  // Device/profile selector lives above the key canvas, as in Stream Deck.
  const identityBlock = document.createElement('div');
  identityBlock.className = 'sd-identity';
  identityBlock.append(identity, profile);
  titleWrap.prepend(identityBlock);
  // Retain the existing page title and parent-navigation controls.
  const pageTitle = document.createElement('div');
  pageTitle.className = 'sd-page-title';
  for (const item of ['#page-back', '#page-title']) {
    const element = $(item, titleWrap);
    if (element) pageTitle.append(element);
  }
  titleWrap.append(pageTitle);

  // The same page controls, with their original event listeners, now sit
  // immediately below the device preview rather than in the action sidebar.
  const pages = document.createElement('nav');
  pages.className = 'sd-pages';
  pages.setAttribute('aria-label', '페이지 전환 및 추가');
  pages.append(pageHeading, pageList);
  $('.device-shell', stage)?.after(pages);

  // Keep existing installed-plugins/store launch buttons in their own tab.
  const switcher = document.createElement('div');
  switcher.className = 'sd-sidebar-tabs';
  switcher.setAttribute('role', 'tablist');
  switcher.setAttribute('aria-label', '키와 플러그인');
  const keyButton = document.createElement('button');
  const pluginButton = document.createElement('button');
  for (const [button, name, label] of [
    [keyButton, 'keys', '키'],
    [pluginButton, 'plugins', '플러그인'],
  ]) {
    button.type = 'button';
    button.dataset.sdTab = name;
    button.textContent = label;
    button.className = 'sd-sidebar-tab';
    button.setAttribute('role', 'tab');
    switcher.append(button);
  }
  sidebar.insertBefore(switcher, library);
  const pluginPanel = document.createElement('div');
  pluginPanel.className = 'sd-plugin-panel';
  pluginPanel.hidden = true;
  pluginPanel.append(pluginNav);
  sidebar.insertBefore(pluginPanel, library.nextSibling);
  const selectTab = (which) => {
    const pluginActive = which === 'plugins';
    library.hidden = pluginActive;
    pluginPanel.hidden = !pluginActive;
    for (const button of [keyButton, pluginButton]) {
      const active = button.dataset.sdTab === which;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
  };
  keyButton.addEventListener('click', () => selectTab('keys'));
  pluginButton.addEventListener('click', () => selectTab('plugins'));
  selectTab('keys');
})();
