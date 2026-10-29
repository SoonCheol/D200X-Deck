'use strict';

const KEY_SIZE = 196;

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

/**
 * Draw one key at 196x196.
 * @param {HTMLCanvasElement} canvas
 * @param {{emoji?:string,label?:string,color?:string,icon?:string|null,action?:object}} key
 */
async function drawKey(canvas, key) {
  const size = KEY_SIZE;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const base = shade(key.color || '#1b2130', 0);
  const top = shade(key.color || '#1b2130', 26);
  const bottom = shade(key.color || '#1b2130', -18);

  ctx.save();
  roundRect(ctx, 0, 0, size, size, 15);
  ctx.clip();

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (key.icon) {
    try {
      const img = await loadImage(key.icon);
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, size, size);
    } catch {
      /* broken image: fall through to emoji */
    }
  }

  if (!key.icon) {
    // subtle vignette
    const v = ctx.createRadialGradient(size / 2, size * 0.42, 10, size / 2, size * 0.5, size * 0.8);
    v.addColorStop(0, 'rgba(255,255,255,0.045)');
    v.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, size, size);
  }

  const label = (key.label || '').trim();
  const emoji = (key.emoji || '').trim();
  const hasLabel = Boolean(label);

  if (emoji && !key.icon) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '98px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.fillText(emoji, size / 2, hasLabel ? size * 0.44 : size / 2);
    ctx.restore();
  }

  if (!emoji && !key.icon) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '300 54px -apple-system, "Helvetica Neue", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillText('+', size / 2, hasLabel ? size * 0.44 : size / 2);
    ctx.restore();
  }

  if (hasLabel) {
    const g = ctx.createLinearGradient(0, size - 62, 0, size);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, size - 62, size, 62);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 17px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(fitText(ctx, label, size - 28), 14, size - 13);
    ctx.restore();
  }

  // page indicator
  if (key.action && key.action.type === 'page') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 20px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('›', size - 18, 22);
    ctx.restore();
  }

  ctx.restore();

  // border
  ctx.save();
  roundRect(ctx, 0.75, 0.75, size - 1.5, size - 1.5, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.085)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

window.KeyRenderer = { drawKey, KEY_SIZE, loadImage };
