// n8n Workflow Monitor — Ulanzi Deck plugin (backend / Node.js v20)
// Thin STABLE shell: SDK wiring + per-key monitors + HOT-RELOAD of logic.js.
// Don't edit this for design/data tweaks — edit logic.js (it reloads live, no Studio restart).
import UlanzideckApi from '../libs/node/ulanzideckApi.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { execFile } from 'child_process';

const PLUGIN_VERSION = '1.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = path.join(__dirname, 'logic.js');

const DEBUG = process.env.N8N_MON_DEBUG === '1';
function dlog(msg) {
  if (!DEBUG) return;
  try { fs.appendFileSync(path.join(os.tmpdir(), 'n8n_monitor.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {}
}
// desktop notification on a workflow's ERR/recover transition.
// Default = osascript: works for everyone with ZERO setup (shows under the "Script Editor" name).
// We deliberately do NOT bundle terminal-notifier — unsigned notification helpers are silently
// blocked on modern macOS (it would force each user to grant permissions). If the user installed
// it themselves (`brew install terminal-notifier`) we use it for a nicer icon; otherwise osascript.
function findMacNotifier() {
  for (const p of ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier', '/usr/bin/terminal-notifier']) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}
function macOsascript(title, message) {
  const e = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execFile('osascript', ['-e', `display notification "${e(message)}" with title "${e(title)}" sound name "Glass"`], () => {});
}
function notifyOS(title, message, iconPath) {
  try {
    if (os.platform() === 'darwin') {
      const tn = findMacNotifier();
      if (tn) {
        const args = ['-title', String(title), '-message', String(message), '-sound', 'Glass'];
        if (iconPath) args.push('-contentImage', String(iconPath));
        execFile(tn, args, (err) => { if (err) macOsascript(title, message); });
      } else macOsascript(title, message);
    } else if (os.platform() === 'win32') {
      const e = s => String(s).replace(/'/g, "''");
      const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; $t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $n=$t.GetElementsByTagName('text'); $n.Item(0).AppendChild($t.CreateTextNode('${e(title)}')) > $null; $n.Item(1).AppendChild($t.CreateTextNode('${e(message)}')) > $null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('n8n Workflow Monitor').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
      execFile('powershell', ['-NoProfile', '-Command', ps], () => {});
    } else { console.log('[n8n-mon notify]', title, message); }
  } catch (e) {}
}

// hot-reloadable logic module (re-imported with a cache-busting query on change)
let logic = null;
async function loadLogic() {
  logic = await import(pathToFileURL(LOGIC_PATH).href + '?v=' + Date.now());
  return logic;
}

// FAIR push budget: the total device-push rate is capped AND split EVENLY among the keys
// that are animating right now → a deck full of marquees stays responsive AND every title
// keeps moving (just slower when many), instead of a few keys hogging the whole budget.
const MAX_PUSH_PER_SEC = 40;
let _activeKeys = 1;   // recomputed each second = how many keys pushed (fair-share denominator)

// ── per-key monitor (state only; all behaviour delegated to logic) ───────────────
class Monitor {
  constructor(context, $UD) {
    this.context = context;
    this.$UD = $UD;
    this.config = { ...logic.CONFIG_DEFAULTS };
    this.state = logic.freshState();
    this.anim = { frame: 0, blink: false, t0: Date.now() };
    this._lastSvg = null;
    this._lastPush = 0;
    this._pushCount = 0;
    this._busy = false;
    this.checkTimer = null;
    this.animTimer = null;
  }

  setConfig(param) {
    if (param && param.forceCheck) { this.checkNow(); return; }
    const reset = logic.applyConfig(this.config, param || {});
    if (reset) this.state = logic.freshState();
    this._startLoops();
    this.render();   // instant: new layout/color/metric/period applies immediately, no wait for fetch
    if (this.config.workflowId && this.config.apiKey) this.checkNow();
    else { this.state.status = 'checking'; this.state.name = 'set workflow…'; this.render(); }
  }

  _startLoops() {
    const ms = Math.max(10, this.config.intervalSec) * 1000;
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => this.checkNow(), ms);
    if (!this.animTimer) {
      this.animTimer = setInterval(() => {
        this.anim.frame++;
        const unstable = this.state.status === 'down' || this.state.status === 'slow';
        if (unstable && this.anim.frame % 4 === 0) this.anim.blink = !this.anim.blink;
        this.render();   // dedupe + fair-share inside render() keep this cheap: static/paginated keys push almost nothing
      }, 80);
    }
  }

  async checkNow() {
    if (this._busy) return;
    this._busy = true;
    const prevStatus = this.state.status;
    try { this.state = await logic.computeStats(this.config, this.state); }
    catch (e) { dlog('checkNow error: ' + e.message); }
    finally { this._busy = false; this._maybeNotify(prevStatus); this.render(); }
  }

  // fire a desktop notification only on an ERR↔recover transition (not every check)
  _maybeNotify(prevStatus) {
    if (!this.config.notify || prevStatus === 'checking') return;
    const now = this.state.status, name = this.state.name || 'Workflow';
    const iconDir = path.join(__dirname, '..', 'assets', 'icons');
    if (now === 'down' && prevStatus !== 'down') notifyOS('n8n Workflow Monitor', `${name} is failing (${this.state.errors} errors)`, path.join(iconDir, 'notify-down.png'));
    else if (now !== 'down' && prevStatus === 'down') notifyOS('n8n Workflow Monitor', `${name} recovered`, path.join(iconDir, 'notify-up.png'));
  }

  render() {
    try {
      const svg = logic.generateSVG({
        ...this.state,
        ...this.config,        // theme, layout, metric, period, thresholds — all flow to the renderer
        animFrame: this.anim.frame,
        animMs: Date.now() - this.anim.t0,   // wall-clock → even, jitter-free marquee scroll
        blinkOn: this.anim.blink
      });
      const diff = svg !== this._lastSvg;
      const gap = 1000 * _activeKeys / MAX_PUSH_PER_SEC;   // this key's fair slice of the budget
      if (diff && (Date.now() - this._lastPush) >= gap) {   // changed AND it's our turn → send to the device
        this._lastPush = Date.now();
        this._lastSvg = svg;
        this._pushCount++;
        this.$UD.setBaseDataIcon(this.context, 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
      }
      return diff;   // report "content changed" → key stays awake even if this frame was throttled
    } catch (e) { console.error('[n8n-mon] render error:', e.message); return false; }
  }

  // reply to the Property Inspector with the saved config (so its fields fill on open)
  pushConfig() {
    try { this.$UD.sendParamFromPlugin({ ...this.config }, this.context); } catch (e) {}
  }

  // press the key → open the workflow editor OR its executions list (per pressAction); refresh if unconfigured
  openWorkflow() {
    const base = (this.config.n8nUrl || '').replace(/\/+$/, '');
    const id = this.config.workflowId;
    if (!base || !id) { this.checkNow(); return; }
    const path = this.config.pressAction === 'executions'
      ? `/workflow/${encodeURIComponent(id)}/executions`
      : `/workflow/${encodeURIComponent(id)}`;
    try { this.$UD.openUrl(base + path); } catch (e) { this.checkNow(); }
  }

  destroy() {
    if (this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = null; }
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
  }
}

// ── bootstrap (runs after logic is loaded; no top-level await) ────────────────────
const $UD = new UlanzideckApi();
const CACHES = {};

function startup() {
  // HOT RELOAD: when logic.js changes on disk, re-import + re-render every key (no Studio restart)
  try {
    fs.watchFile(LOGIC_PATH, { interval: 400 }, async () => {
      try {
        await loadLogic();
        dlog('logic.js reloaded');
        for (const m of Object.values(CACHES)) { m.render(); m.checkNow(); }
      } catch (e) { console.error('[n8n-mon] logic reload failed:', e.message); }
    });
  } catch (e) { dlog('watch unsupported: ' + e.message); }

  // recompute the fair-share denominator each second = how many keys actually pushed
  setInterval(() => {
    const ms = Object.values(CACHES);
    _activeKeys = Math.max(1, ms.filter(m => (m._pushCount || 0) > 0).length);
    ms.forEach(m => m._pushCount = 0);
  }, 1000);

  $UD.connect('com.n8n.workflowmonitor.deck');
  $UD.onConnected(() => dlog('connected to Ulanzi'));
  $UD.onError((e) => console.error('[n8n-mon] Error:', typeof e === 'string' ? e : ''));

  $UD.onAdd((jsn) => {
    const ctx = jsn.context;
    if (!CACHES[ctx]) CACHES[ctx] = new Monitor(ctx, $UD);
    if (jsn.param) CACHES[ctx].setConfig(jsn.param);
    else CACHES[ctx].render();
  });

  $UD.onParamFromApp((jsn) => { const i = CACHES[jsn.context]; if (i && jsn.param) i.setConfig(jsn.param); });
  $UD.onParamFromPlugin((jsn) => {
    const i = CACHES[jsn.context];
    if (!i || !jsn.param) return;
    if (jsn.param.__getConfig) { i.pushConfig(); return; }   // PI asked for saved config → reply
    i.setConfig(jsn.param);
  });

  // press the key → refresh now
  $UD.onRun((jsn) => { const i = CACHES[jsn.context]; if (i) i.openWorkflow(); });
  $UD.onSetActive((jsn) => { const i = CACHES[jsn.context]; if (i) i.render(); });
  $UD.onClear((jsn) => {
    if (!jsn.param) return;
    for (const item of jsn.param) { const i = CACHES[item.context]; if (i) { i.destroy(); delete CACHES[item.context]; } }
  });

  console.log('[n8n-mon] Main Service started (hot-reload) v' + PLUGIN_VERSION);
}

loadLogic().then(startup).catch((e) => console.error('[n8n-mon] init failed:', e.message));
