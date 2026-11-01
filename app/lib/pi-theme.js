'use strict';

// Shared pieces of the property-inspector bridge. Both plugin hosts inject the
// same height reporter; Stream Deck adds the socket connect and link handling.

const SELECT_ARROW_CSS = `
  /* A custom background removes the native select arrow; draw our own. */
  select {
    -webkit-appearance: none !important;
    appearance: none !important;
    background-image: linear-gradient(45deg, transparent 50%, #8b97ab 50%), linear-gradient(135deg, #8b97ab 50%, transparent 50%) !important;
    background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50% !important;
    background-size: 5px 5px, 5px 5px !important;
    background-repeat: no-repeat !important;
    background-color: #141a25 !important;
    height: auto !important;
    min-height: 30px;
    line-height: normal !important;
    padding: 6px 28px 6px 9px !important;
  }`;

/**
 * Build the script injected into a plugin inspector.
 * `connect` is the socket payload for Stream Deck/OpenAction (or null);
 * `openLinks` forwards window.open() to the app instead of opening a window.
 */
function buildPiBridge({ connect = null, openLinks = false } = {}) {
  // Escape "<" so a setting containing "</script>" cannot close the tag.
  const payload = connect ? JSON.stringify(connect).replace(/</g, '\\u003c') : 'null';
  const connectBlock = connect
    ? `
    function connectInspector() {
      if (!payload) {
        // The action was not registered when this page was served (for example
        // a plugin action that is still being synced). Reload with a fresh
        // payload instead of staying disconnected forever.
        const params = new URLSearchParams(location.search);
        const attempt = Number(params.get('attempt') || 0);
        if (attempt < 12) {
          params.set('attempt', String(attempt + 1));
          setTimeout(() => { location.href = location.pathname + '?' + params.toString(); }, 250);
        }
        return true;
      }
      try {
        if (typeof connectOpenActionSocket === 'function') { connectOpenActionSocket(...payload); return true; }
        if (typeof connectElgatoStreamDeckSocket === 'function') { connectElgatoStreamDeckSocket(...payload); return true; }
      } catch (err) { console.error(err); return true; }
      return false;
    }
    if (!connectInspector()) {
      let n = 0;
      const timer = setInterval(() => { if (connectInspector() || ++n > 100) clearInterval(timer); }, 50);
    }`
    : '';
  const openBlock = openLinks
    ? `
    const sdOpen = window.open;
    window.open = (url, target) => {
      if (target === '_self' || target === '_top') return sdOpen.call(window, url, target);
      try {
        const absolute = new URL(url, window.location.href).href;
        parent.postMessage({ type: 'sd-pi-open', url: absolute }, '*');
      } catch (e) {}
      return null;
    };`
    : '';

  return `<script>(function(){
    const payload = ${payload};${connectBlock}${openBlock}
    function report() {
      try {
        const visible = (el) => {
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
        };
        const vh = window.innerHeight;
        // A full-height wrapper would otherwise report the frame's own height
        // and grow forever; measure its children instead.
        function measure(el) {
          if (!visible(el)) return 0;
          const rect = el.getBoundingClientRect();
          if (rect.height >= vh - 2 && el.children.length) {
            let max = 0;
            for (const child of el.children) max = Math.max(max, measure(child));
            return max;
          }
          return rect.bottom;
        }
        let h = 0;
        for (const el of document.body.children) h = Math.max(h, measure(el));
        parent.postMessage({ type: 'ulanzi-pi-height', height: Math.ceil(h + 8) }, '*');
      } catch (e) {}
    }
    window.addEventListener('load', report);
    setTimeout(report, 250);
    setTimeout(report, 800);
    if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
    window.addEventListener('resize', report);
  })();</script>`;
}

module.exports = { SELECT_ARROW_CSS, buildPiBridge };
