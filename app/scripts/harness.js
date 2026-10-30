'use strict';

// Dev-only screenshot harness. Loaded by main.js only when ULANZI_SHOT is set;
// it drives the window through env vars, captures a PNG and quits.

const fs = require('node:fs');

function attachScreenshotHarness({ win, send, quitNow }) {
  if (process.env.ULANZI_SHOT) {
    win.webContents.once('did-finish-load', () => {
      const delay = Number(process.env.ULANZI_SHOT_DELAY || 1800);
      setTimeout(async () => {
        try {
          if (process.env.ULANZI_KEY) {
            send('deck:key', { index: Number(process.env.ULANZI_KEY), pressed: true, state: 1 });
            await new Promise((r) => setTimeout(r, 900));
          }
          if (process.env.ULANZI_INSTALLED) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#plugins-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 400));
            if (process.env.ULANZI_SCROLL) {
              await win.webContents.executeJavaScript(
                "(() => { const l = document.querySelector('#plugin-list'); if (l) l.scrollTop = l.scrollHeight; return true; })()"
              );
            }
            if (process.env.ULANZI_INSTALLED === 'icons') {
              await win.webContents.executeJavaScript(
                "document.querySelector('#tab-icons-btn')?.click(); true"
              );
            }
            await new Promise((r) => setTimeout(r, 900));
          }
          if (process.env.ULANZI_PLUGINS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#plugins-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 700));
          }
          if (process.env.ULANZI_PI_DEBUG) {
            await new Promise((r) => setTimeout(r, 2500));
            const frames = win.webContents.mainFrame.framesInSubtree.filter((f) => f.url.startsWith('ulanzi-pi://'));
            for (const frame of frames) {
              try {
                const out = await frame.executeJavaScript(`(() => {
                  const b = getComputedStyle(document.body);
                  const inp = document.querySelector('input[type=number], input[type=text]');
                  const row = inp ? inp.closest('.row') : null;
                  return JSON.stringify({
                    bodyW: document.body.clientWidth, bodyPadR: b.paddingRight,
                    scrollW: window.innerWidth - document.documentElement.clientWidth,
                    inpW: inp ? inp.offsetWidth : null,
                    rowW: row ? row.offsetWidth : null,
                    rowPad: row ? getComputedStyle(row).paddingRight : null,
                    theme: !!document.getElementById('ulanzi-deck-open-theme'),
                  });
                })()`);
                console.log('[pidebug]', out);
              } catch (e) { console.log('[pidebug] err', e.message); }
            }
          }
          if (process.env.ULANZI_SETTINGS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#deck-settings-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 500));
          }
          if (process.env.ULANZI_CLICK) {
            const idx = Number(process.env.ULANZI_CLICK) || 0;
            await win.webContents.executeJavaScript(
              `document.querySelectorAll('.key')[${idx}]?.click(); true`
            );
            await new Promise((r) => setTimeout(r, 500));
          }
          if (process.env.ULANZI_DRAG) {
            const [from, to] = process.env.ULANZI_DRAG.split(',').map(Number);
            await win.webContents.executeJavaScript(`
              (() => {
                const tiles = document.querySelectorAll('.key');
                const dt = new DataTransfer();
                tiles[${from}].dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
                tiles[${to}].dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
                tiles[${to}].dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 800));
          }
          if (process.env.ULANZI_CHANGE_MEDIA) {
            await win.webContents.executeJavaScript(`
              (async () => {
                document.querySelectorAll('.key')[0]?.click();
                await new Promise(r => setTimeout(r, 300));
                const v = document.querySelector('#insp-value');
                v.value = ${JSON.stringify(process.env.ULANZI_CHANGE_MEDIA)};
                v.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_SET_MEDIA) {
            await win.webContents.executeJavaScript(`
              (() => {
                document.querySelectorAll('.key')[0]?.click();
                const type = document.querySelector('#insp-action-type');
                type.value = 'media';
                type.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => {
                  const v = document.querySelector('#insp-value');
                  v.value = ${JSON.stringify(process.env.ULANZI_SET_MEDIA)};
                  v.dispatchEvent(new Event('change', { bubbles: true }));
                }, 300);
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1500));
          }
          if (process.env.ULANZI_PRESS) {
            const index = Number(process.env.ULANZI_PRESS_INDEX || 0);
            const mode = process.env.ULANZI_PRESS;
            send('deck:key', { index, pressed: true, state: 1 });
            if (mode === 'double') {
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: false, state: 0 });
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: true, state: 1 });
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: false, state: 0 });
            } else {
              await new Promise((r) => setTimeout(r, Number(process.env.ULANZI_PRESS_HOLD || 120)));
              send('deck:key', { index, pressed: false, state: 0 });
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_ACTION) {
            const payload = JSON.parse(process.env.ULANZI_ACTION);
            const res = await win.webContents.executeJavaScript(
              `window.deckApp.runAction(${JSON.stringify(payload)}).then(r => JSON.stringify(r))`
            );
            console.log('[shot] action', res);
          }
          if (process.env.ULANZI_TEST_ICONS) {
            const out = await win.webContents.executeJavaScript(
              "window.deckApp.installIconPack(" + JSON.stringify(process.env.ULANZI_TEST_ICONS) + ").then(r => JSON.stringify(r)).catch(e => 'ERR ' + e.message)"
            );
            console.log('[shot] icons', out);
          }
          if (process.env.ULANZI_LIBRARY) {
            await win.webContents.executeJavaScript(`
              (async () => {
                document.querySelectorAll('.key')[0]?.click();
                await new Promise(r => setTimeout(r, 400));
                document.querySelector('#insp-icon-library')?.click();
                await new Promise(r => setTimeout(r, 2500));
                document.querySelectorAll('.icon-tile')[0]?.click();
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1500));
          }
          if (process.env.ULANZI_SET_TRIGGER) {
            const [field, type] = process.env.ULANZI_SET_TRIGGER.split(':');
            await win.webContents.executeJavaScript(`
              (() => {
                const s = document.querySelector('[data-trigger-type="${field}"]');
                if (!s) return 'no-select';
                s.value = '${type}';
                s.dispatchEvent(new Event('change', { bubbles: true }));
                return 'ok';
              })()
            `).then((r) => console.log('[shot] trigger', r));
            await new Promise((r) => setTimeout(r, 800));
          }
          if (process.env.ULANZI_STORE) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#store-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 4000));
            if (process.env.ULANZI_STORE_CAT) {
              await win.webContents.executeJavaScript(
                `document.querySelectorAll('.store-cat')[${Number(process.env.ULANZI_STORE_CAT) || 0}]?.click(); true`
              );
              await new Promise((r) => setTimeout(r, 3500));
            }
            if (process.env.ULANZI_STORE_SEARCH) {
              await win.webContents.executeJavaScript(`
                (() => {
                  const s = document.querySelector('#store-search');
                  s.value = ${JSON.stringify(process.env.ULANZI_STORE_SEARCH)};
                  s.dispatchEvent(new Event('input', { bubbles: true }));
                  return true;
                })()
              `);
              await new Promise((r) => setTimeout(r, 2500));
            }
            if (process.env.ULANZI_STORE_ITEM) {
              await win.webContents.executeJavaScript(
                `document.querySelectorAll('.store-item')[${Number(process.env.ULANZI_STORE_ITEM) || 0}]?.click(); true`
              );
              await new Promise((r) => setTimeout(r, 2500));
            }
            if (process.env.ULANZI_STORE_DOWNLOAD) {
              await win.webContents.executeJavaScript(
                "document.querySelector('#store-download-icons')?.click(); true"
              );
              await new Promise((r) => setTimeout(r, 9000));
            }
            if (process.env.ULANZI_STORE_INSTALL) {
              await win.webContents.executeJavaScript(
                "document.querySelector('#store-install')?.click(); true"
              );
              await new Promise((r) => setTimeout(r, 6000));
            }
          }
          if (process.env.ULANZI_HOTKEY) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-hotkey-open')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env.ULANZI_APPICON) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-use-app-icon')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_APPS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-pick-app')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 1500));
          }
          if (process.env.ULANZI_ESC) {
            await win.webContents.executeJavaScript(
              "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true"
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          await win.webContents.executeJavaScript('document.activeElement && document.activeElement.blur(); true');
          await new Promise((r) => setTimeout(r, 150));
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.ULANZI_SHOT, image.toPNG());
        } finally {
          quitNow();
        }
      }, delay);
    });
  }
}

module.exports = { attachScreenshotHarness };
