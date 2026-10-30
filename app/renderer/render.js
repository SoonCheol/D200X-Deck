'use strict';

const KEY_SIZE = 196;
const WIDE_KEY_SIZE = { width: 402, height: 196 };
const WIDE_INDEX = 13;

const imageCache = new Map();

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
  imageCache.set(src, promise);
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
  try {
    return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\uFE0F\s]+$/u.test(text);
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
async function drawKey(canvas, key, width = KEY_SIZE, height = KEY_SIZE, autoIcon = null) {
  const w = width;
  const h = height;
  const min = Math.min(w, h);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

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

  if (key.icon) {
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
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, 0, w, h);
      }
    } catch {
      /* broken image: fall through */
    }
  }

  if (!key.icon) {
    const v = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.5, min * 0.8);
    v.addColorStop(0, 'rgba(255,255,255,0.045)');
    v.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  const label = (key.label || '').trim();
  const main = truncateMain(key.emoji || '');
  const hasLabel = Boolean(label);

  let drewAutoIcon = false;
  if (!key.icon && autoIcon) {
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

  if (main && !key.icon && !drewAutoIcon) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    const y = hasLabel ? h * 0.44 : h / 2;
    if (isEmojiOnly(main)) {
      ctx.font = `${Math.round(min * 0.5)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(main, w / 2, y);
    } else {
      const maxWidth = w - 26;
      let size = Math.round(min * 0.6);
      const fontFor = (s) => `700 ${s}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
      ctx.font = fontFor(size);
      while (size > 16 && ctx.measureText(main).width > maxWidth) {
        size -= 2;
        ctx.font = fontFor(size);
      }
      ctx.fillText(main, w / 2, y);
    }
    ctx.restore();
  }

  if (!main && !key.icon && !drewAutoIcon) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `300 ${Math.round(min * 0.28)}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillText('+', w / 2, hasLabel ? h * 0.44 : h / 2);
    ctx.restore();
  }

  if (hasLabel) {
    const g = ctx.createLinearGradient(0, h - 62, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - 62, w, 62);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 17px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(fitText(ctx, label, w - 28), 14, h - 13);
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

  ctx.restore();

  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.085)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawSystemPanel(canvas) {
  const w = WIDE_KEY_SIZE.width;
  const h = WIDE_KEY_SIZE.height;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  roundRect(ctx, 0, 0, w, h, 15);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b2333');
  g.addColorStop(1, '#0d1220');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '600 10px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SYSTEM PANEL', 18, 26);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '200 72px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(time, w / 2, h * 0.47);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 12px -apple-system, "SF Pro Text", sans-serif';
  ctx.fillText(date, w / 2, h * 0.76);
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

window.KeyRenderer = { drawKey, drawSystemPanel, KEY_SIZE, WIDE_KEY_SIZE, WIDE_INDEX };
