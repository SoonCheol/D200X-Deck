'use strict';

/* global timerTextFor, DeckTextStyle */

const KEY_SIZE = 196;
const WIDE_KEY_SIZE = { width: 402, height: 196 };
const { WIDE_INDEX } = window.DeckGeometry;

// Bounded image cache: live plugin images change constantly, so an unbounded map
// would grow forever in a long-running menu-bar app.
const IMAGE_CACHE_MAX = 120;
const imageCache = new Map();

function loadImage(src) {
  if (imageCache.has(src)) {
    const hit = imageCache.get(src);
    // refresh recency
    imageCache.delete(src);
    imageCache.set(src, hit);
    return hit;
  }
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
  promise.catch(() => imageCache.delete(src));
  imageCache.set(src, promise);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    imageCache.delete(oldest);
  }
  return promise;
}

function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 26, g: 31, b: 41 };
  const n = parseInt(m[1], 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return {
    r: clamp(((n >> 16) & 255) + amount),
    g: clamp(((n >> 8) & 255) + amount),
    b: clamp((n & 255) + amount),
  };
}

function rgb({ r, g, b }, a = 1) {
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

function truncateMain(text) {
  const chars = [...String(text || '').trim()];
  if (chars.length > 12) return `${chars.slice(0, 12).join('')}…`;
  return chars.join('');
}

function isEmojiOnly(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    // Digits and #/* are Emoji_Component too, but "123" is plain text.
    if (/^[0-9#*]\uFE0F?\u20E3$/u.test(value)) return true; // 1️⃣, #️⃣
    if (/^\p{Regional_Indicator}{2}$/u.test(value)) return true; // flags
    return /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\uFE0F\s]+$/u.test(value);
  } catch {
    return false;
  }
}

/**
 * Draw one key.
 * @param {HTMLCanvasElement} canvas
 * @param {object} key
 * @param {number} width  196 for normal keys, 402 for the wide key
 * @param {number} height 196
 */
function fitText(ctx, text, maxWidth) {
  let value = String(text || '');
  while (value.length > 1 && ctx.measureText(value).width > maxWidth) value = value.slice(0, -1);
  return value;
}

/** Shrink an auto-sized line until it fits, never above the default size. */
function fitFontSize(ctx, text, maxWidth, startSize, minSize, fontFor) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = fontFor(size);
    if (ctx.measureText(String(text || '')).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

/** Native text tile: accent bar, glyph, title and subtitle, all editable. */
function drawTile(ctx, key, w, h) {
  const tile = key.tile && typeof key.tile === 'object' ? key.tile : {};
  const accent = /^#[0-9a-f]{6}$/i.test(tile.accent || '') ? tile.accent : '#4f8cff';
  const base = key.color || '#1b2130';
  const top = shade(base, 26);
  const bottom = shade(base, -18);
  const glyph = String(tile.glyph || key.emoji || '').trim();
  const title = String(tile.title || key.label || '').trim();
  const subtitle = String(tile.subtitle || '').trim();

  ctx.save();
  roundRect(ctx, 0, 0, w, h, 15);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, Math.max(5, Math.round(h * 0.06)));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (glyph) {
    const fontFor = (size) => `500 ${size}px -apple-system, "SF Pro Text", sans-serif`;
    const size = tile.glyphSize
      ? Math.min(80, Math.max(8, Number(tile.glyphSize)))
      : fitFontSize(ctx, glyph, w - 18, Math.round(h * 0.3), 14, fontFor);
    ctx.font = fontFor(size);
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(tile.glyphColor || '') ? tile.glyphColor : '#f4f7ff';
    ctx.fillText(fitText(ctx, glyph, w - 18), w / 2, h * 0.39);
  }
  if (title) {
    const fontFor = (size) => `700 ${size}px -apple-system, "SF Pro Text", sans-serif`;
    const size = tile.titleSize
      ? Math.min(48, Math.max(7, Number(tile.titleSize)))
      : fitFontSize(ctx, title, w - 16, Math.round(h * (glyph ? 0.12 : 0.17)), 8, fontFor);
    ctx.font = fontFor(size);
    ctx.fillStyle = '#f4f7ff';
    // Without a glyph the title takes the glyph's place instead of leaving a gap above it.
    ctx.fillText(fitText(ctx, title, w - 16), w / 2, glyph ? h * 0.67 : h * 0.47);
  }
  if (subtitle) {
    const fontFor = (size) => `400 ${size}px -apple-system, "SF Pro Text", sans-serif`;
    const size = tile.subtitleSize
      ? Math.min(40, Math.max(6, Number(tile.subtitleSize)))
      : fitFontSize(ctx, subtitle, w - 16, Math.round(h * 0.095), 7, fontFor);
    ctx.font = fontFor(size);
    ctx.fillStyle = 'rgba(232,237,246,0.62)';
    ctx.fillText(fitText(ctx, subtitle, w - 16), w / 2, h * 0.82);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 15);
  ctx.stroke();
  ctx.restore();
}

async function drawKey(canvas, key, width = KEY_SIZE, height = KEY_SIZE, autoIcon = null, pageInfo = null) {
  const w = width;
  const h = height;
  const min = Math.min(w, h);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (key.face === 'tile') {
    drawTile(ctx, key, w, h);
    return;
  }
  // A key can show an image or its text, never both. The page indicator is
  // drawn dynamically (number + dots), so an imported icon/emoji must not
  // cover it.
  const isIndicator = key.action?.type === 'indicator';
  const showIcon = key.face !== 'text' && !isIndicator;
  if (!showIcon) autoIcon = null;

  const top = shade(key.color || '#1b2130', 26);
  const bottom = shade(key.color || '#1b2130', -18);

  ctx.save();
  roundRect(ctx, 0, 0, w, h, 15);
  ctx.clip();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (key.icon && showIcon) {
    try {
      const img = await loadImage(key.icon);
      if (key.iconSource === 'site' || key.iconSource === 'app') {
        let inset = key.iconSource === 'site' ? 44 : 26;
        if (key.iconSource === 'site') {
          ctx.save();
          roundRect(ctx, 24, 24, w - 48, h - 48, 18);
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          ctx.fill();
          ctx.restore();
        }
        const availW = w - inset * 2;
        const availH = h - inset * 2;
        const scale = Math.min(availW / img.width, availH / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
      } else {
        const scale = Math.max(w / img.width, h / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
        // A live image (plugin or command output) is shown as drawn, as in the
        // vendor app, unless a caption was explicitly turned on over it.
        if (!key.liveImage || key.font?.captionExplicit === true) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(0, 0, w, h);
        }
      }
    } catch {
      /* broken image: fall through */
    }
  }

  if (!key.icon || !showIcon) {
    const v = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.5, min * 0.8);
    v.addColorStop(0, 'rgba(255,255,255,0.045)');
    v.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  // Page/profile wallpaper: one image covers the whole 5×3 key area and each
  // key paints its own slice, so the deck looks like a single surface.
  const slot = Number(pageInfo?.slot);
  if (pageInfo?.background && Number.isInteger(slot) && slot >= 0 && slot <= 12) {
    try {
      const img = await loadImage(pageInfo.background);
      const fullW = KEY_SIZE * 5;
      const fullH = KEY_SIZE * 3;
      const scale = Math.max(fullW / img.width, fullH / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      const col = slot % 5;
      const row = Math.floor(slot / 5);
      ctx.save();
      ctx.drawImage(img, (fullW - iw) / 2 - col * KEY_SIZE, (fullH - ih) / 2 - row * KEY_SIZE, iw, ih);
      ctx.fillStyle = 'rgba(7,10,16,0.46)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } catch {
      /* broken background: keep the key colour */
    }
  }

  const label = (key.label || '').trim();
  const font = key.font && typeof key.font === 'object' ? key.font : {};
  const timerText = typeof timerTextFor === 'function' ? timerTextFor(key.action) : '';
  const main = timerText || truncateMain(key.emoji || '');
  const hasLabel =
    !isIndicator &&
    Boolean(label) &&
    font.showLabel !== false &&
    (!key.liveImage || font.captionExplicit === true);

  let drewAutoIcon = false;
  if (!key.icon && showIcon && autoIcon && !timerText) {
    try {
      const img = await loadImage(autoIcon);
      const size = Math.round(min * 0.54);
      const y = (hasLabel ? h * 0.42 : h / 2) - size / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.96;
      ctx.drawImage(img, (w - size) / 2, y, size, size);
      ctx.restore();
      drewAutoIcon = true;
    } catch {
      /* fall back to the emoji */
    }
  }

  if (key.action && key.action.type === 'indicator') {
    const total = Math.max(1, pageInfo?.total || 1);
    const current = Math.max(1, Math.min(total, pageInfo?.index || 1));
    const numberY = hasLabel ? h * 0.38 : h * 0.42;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 64px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(String(current), w / 2, numberY);
    ctx.restore();

    // Dots for every page, centred under the number (wrapping if needed).
    const perRow = Math.min(total, 7);
    const dot = 8;
    const gap = 7;
    const rowGap = 7;
    const totalRows = Math.ceil(total / perRow);
    const dotsY = numberY + 46;
    ctx.save();
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, total - row * perRow);
      const rowWidth = inRow * dot + (inRow - 1) * gap;
      const x = (w - rowWidth) / 2 + (i % perRow) * (dot + gap);
      const y = dotsY + row * (dot + rowGap);
      roundRect(ctx, x, y, dot, dot, dot / 2);
      ctx.fillStyle = i === current - 1 ? 'rgba(120,175,255,0.95)' : 'rgba(255,255,255,0.22)';
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '600 11px -apple-system, "SF Pro Text", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${current} / ${total}`, w / 2, dotsY + totalRows * (dot + rowGap) + 3);
    ctx.restore();
  }

  if (main && !isIndicator && (!key.icon || !showIcon) && !drewAutoIcon) {
    const textStyle = key.textStyle && typeof key.textStyle === 'object' ? key.textStyle : {};
    const family = DeckTextStyle.fontStack(textStyle.family);
    const weight = Math.max(100, Math.min(900, Math.round(Number(textStyle.weight) || 700)));
    const color = textStyle.color || '#fff';
    const emojiOnly = isEmojiOnly(main);
    const maxWidth = w - 26;
    let size = Math.round(min * (emojiOnly ? 0.5 : 0.6));
    const fontFor = (s) =>
      emojiOnly ? `${s}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif` : `${weight} ${s}px ${family}`;
    const x = w / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontFor(size);
    while (size > 16 && ctx.measureText(main).width > maxWidth) {
      size -= 2;
      ctx.font = fontFor(size);
    }
    const y = hasLabel ? h * 0.44 : h / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(main, x, y);
    ctx.restore();
  }

  // The “+” is an affordance for an empty slot. Keys with a real action draw
  // their own face (page indicator, text, …) and must not show it underneath.
  const blankSlot = !key.action || key.action.type === 'none';
  if (!main && !key.icon && !drewAutoIcon && blankSlot) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `300 ${Math.round(min * 0.28)}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.fillText('+', w / 2, hasLabel ? h * 0.44 : h / 2);
    ctx.restore();
  }

  if (hasLabel) {
    const size = Math.max(10, Math.min(40, Number(font.size) || 17));
    const weight = Math.max(100, Math.min(900, Math.round(Number(font.weight) || 400)));
    const align = ['left', 'center', 'right'].includes(font.align) ? font.align : 'left';
    const family = DeckTextStyle.fontStack(font.family);
    const background = DeckTextStyle.normalizeBackground(font.background, 'gradient');
    if (background === 'gradient') {
      const shadeH = Math.max(62, Math.round(size) + 40);
      const g = ctx.createLinearGradient(0, h - shadeH, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h - shadeH, w, shadeH);
    } else if (background === 'solid') {
      const barH = Math.max(34, Math.round(size) + 20);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h - barH, w, barH);
    }

    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = `${weight} ${size}px ${family}`;
    const color = font.color || 'rgba(255,255,255,0.94)';
    const inset = 14;
    const x = align === 'center' ? w / 2 : align === 'right' ? w - inset : inset;
    const y = h - 13;
    ctx.fillStyle = color;
    ctx.fillText(fitText(ctx, label, w - inset * 2), x, y);
    ctx.restore();
  }

  const badges = [];
  if (key.holdAction && key.holdAction.type && key.holdAction.type !== 'none') badges.push('H');
  if (key.doubleAction && key.doubleAction.type && key.doubleAction.type !== 'none') badges.push('2×');
  if (!isIndicator && badges.length) {
    ctx.save();
    ctx.font = '700 11px -apple-system, "SF Pro Text", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let x = 10;
    for (const badge of badges) {
      const wBox = ctx.measureText(badge).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, x, 9, wBox, 18, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(badge, x + 5, 18.5);
      x += wBox + 5;
    }
    ctx.restore();
  }

  if (key.action && key.action.type === 'page') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 20px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('›', w - 18, 22);
    ctx.restore();
  }

  // Imported shell commands are flagged until the user reviews them.
  if (key.action && key.action.type === 'command' && key.action.imported) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(w - 17, 17, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 186, 66, 0.95)';
    ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px -apple-system, "SF Pro Text", sans-serif';
    ctx.fillText('!', w - 17, 17.5);
    ctx.restore();
  }

  // A key whose plugin is not available cannot run; flag it on the face too.
  if (key.missingPlugin) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(w - 17, 17, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 186, 66, 0.95)';
    ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px -apple-system, "SF Pro Text", sans-serif';
    ctx.fillText('!', w - 17, 17.5);
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.085)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawAnalogClock(ctx, cx, cy, radius, now) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#22252a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(1, radius * 0.03);
  ctx.stroke();

  // Numerals 1–12 around the dial.
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(radius * 0.25)}px -apple-system, "SF Pro Text", sans-serif`;
  for (let i = 1; i <= 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(String(i), cx + Math.cos(angle) * radius * 0.78, cy + Math.sin(angle) * radius * 0.78);
  }

  const hours = (now.getHours() % 12) + now.getMinutes() / 60;
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  const seconds = now.getSeconds();
  const hand = (angle, length, width, color) => {
    const rad = angle * (Math.PI / 180) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * length, cy + Math.sin(rad) * length);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  hand(hours * 30, radius * 0.45, Math.max(2, radius * 0.075), 'rgba(255,255,255,0.94)');
  hand(minutes * 6, radius * 0.66, Math.max(1.5, radius * 0.05), 'rgba(255,255,255,0.94)');
  hand(seconds * 6, radius * 0.74, Math.max(1, radius * 0.022), '#f0a13a');

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, radius * 0.055), 0, Math.PI * 2);
  ctx.fillStyle = '#f0a13a';
  ctx.fill();
  ctx.restore();
}

async function drawSystemPanel(canvas, options = {}) {
  const w = WIDE_KEY_SIZE.width;
  const h = WIDE_KEY_SIZE.height;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const mode = options.mode === 'stats' || options.mode === 'blank' ? options.mode : 'clock';

  ctx.save();
  roundRect(ctx, 0, 0, w, h, 15);
  ctx.clip();

  if (mode === 'blank' && options.background) {
    try {
      const img = await loadImage(options.background);
      const scale = Math.max(w / img.width, h / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
      ctx.restore();
      return;
    } catch {
      /* fall through to the plain panel */
    }
  }

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#191b1f');
  g.addColorStop(1, '#0e1013');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // The firmware panel pairs an analog dial with the time or the system stats.
  const clockX = w * 0.265;
  const clockR = h * 0.31;

  if (mode === 'stats') {
    const stats = options.stats || {};
    const value = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const columns = [
      ['CPU', value(stats.cpu)],
      ['RAM', value(stats.mem)],
      ['GPU', value(stats.gpu)],
    ];
    const columnW = w / columns.length;
    columns.forEach(([label, pct], i) => {
      const cx = columnW * (i + 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.font = '600 36px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
      ctx.fillText(`${pct}%`, cx, h * 0.43);
      ctx.fillStyle = 'rgba(255,255,255,0.58)';
      ctx.font = '600 12.5px -apple-system, "SF Pro Text", sans-serif';
      ctx.fillText(label, cx, h * 0.68);
    });
  } else if (mode === 'clock') {
    drawAnalogClock(ctx, clockX, h / 2, clockR, now);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '650 62px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
    ctx.fillText(time, w * 0.5, h / 2 + 2);
  }
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

window.KeyRenderer = { drawKey, drawSystemPanel, truncateMain, KEY_SIZE, WIDE_KEY_SIZE, WIDE_INDEX };

// Standby/screensaver: one 980×588 canvas sliced into the 13 square keys.
async function renderStandbySlices(settings = {}) {
  const width = KEY_SIZE * 5;
  const height = KEY_SIZE * 3;
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  const ctx = full.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0d1422');
  bg.addColorStop(0.55, '#080c14');
  bg.addColorStop(1, '#030509');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (settings.standbyImage) {
    try {
      const img = await loadImage(settings.standbyImage);
      const scale = Math.max(width / img.width, height / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, (width - iw) / 2, (height - ih) / 2, iw, ih);
      ctx.fillStyle = 'rgba(3,6,12,0.42)';
      ctx.fillRect(0, 0, width, height);
    } catch {
      /* missing image: keep the gradient */
    }
  }

  if (settings.standbyClock !== false) {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '200 148px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
    ctx.fillText(time, width / 2, height * 0.46);
    ctx.shadowBlur = 12;
    ctx.font = '500 26px -apple-system, "SF Pro Text", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(date.toUpperCase(), width / 2, height * 0.66);
    ctx.restore();
  }

  const images = [];
  for (let index = 0; index < 13; index++) {
    const tile = document.createElement('canvas');
    tile.width = KEY_SIZE;
    tile.height = KEY_SIZE;
    const tctx = tile.getContext('2d');
    tctx.drawImage(
      full,
      (index % 5) * KEY_SIZE,
      Math.floor(index / 5) * KEY_SIZE,
      KEY_SIZE,
      KEY_SIZE,
      0,
      0,
      KEY_SIZE,
      KEY_SIZE
    );
    images.push({ index, png: tile.toDataURL('image/png').split(',')[1] });
  }
  // Slot 13 is the firmware system panel; buildPage ignores its PNG.
  const wide = document.createElement('canvas');
  wide.width = 196;
  wide.height = 196;
  images.push({ index: 13, png: wide.toDataURL('image/png').split(',')[1] });
  return images;
}
