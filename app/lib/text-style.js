'use strict';

// Shared typography for key text and captions. Loaded as a plain script in the
// renderer (sets globalThis.DeckTextStyle) and required by the main process.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckTextStyle = factory();
})(globalThis, function () {
  const FAMILIES = {
    system: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
    avenir: '"Avenir Next", "Helvetica Neue", sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    menlo: 'Menlo, "Courier New", monospace',
  };
  const FAMILY_IDS = Object.keys(FAMILIES);
  const FAMILY_LABELS = {
    system: 'System',
    avenir: 'Avenir Next',
    georgia: 'Georgia',
    menlo: 'Menlo',
  };
  const WEIGHTS = { light: 300, regular: 600, bold: 800 };
  const TEXT_EFFECTS = ['shadow', 'outline', 'none'];
  const CAPTION_BACKGROUNDS = ['gradient', 'solid', 'none'];
  const DEFAULT_TEXT_STYLE = {
    family: 'system',
    weight: 700,
    align: 'center',
    color: '#ffffff',
    effect: 'shadow',
  };
  const DEFAULT_CAPTION_STYLE = {
    family: 'system',
    effect: 'none',
    background: 'gradient',
  };

  function clampWeight(value, fallback) {
    const weight = Math.round(Number(value));
    return Number.isFinite(weight) ? Math.max(100, Math.min(900, weight)) : fallback;
  }

  function normalizeWeight(value, fallback = 600) {
    return clampWeight(value, fallback);
  }

  /** Map any stored weight to the three UI presets. */
  function weightPreset(value) {
    const weight = clampWeight(value, 600);
    if (weight < 500) return 'light';
    if (weight < 700) return 'regular';
    return 'bold';
  }

  function weightValue(preset) {
    return WEIGHTS[preset] || WEIGHTS.regular;
  }

  function normalizeFamily(value) {
    return FAMILY_IDS.includes(value) ? value : 'system';
  }

  function fontStack(value) {
    return FAMILIES[normalizeFamily(value)];
  }

  function normalizeAlign(value, fallback = 'center') {
    return ['left', 'center', 'right'].includes(value) ? value : fallback;
  }

  function normalizeColor(value, fallback = '#ffffff') {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  }

  function normalizeEffect(value, fallback = 'none') {
    return TEXT_EFFECTS.includes(value) ? value : fallback;
  }

  function normalizeBackground(value, fallback = 'gradient') {
    return CAPTION_BACKGROUNDS.includes(value) ? value : fallback;
  }

  /** A dark outline for light text, a light outline for dark text. */
  function contrastOutline(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return 'rgba(0,0,0,0.62)';
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.72)';
  }

  function outlineWidth(size) {
    return Math.max(2, Math.min(6, Math.round((Number(size) || 17) * 0.06)));
  }

  return {
    FAMILIES,
    FAMILY_IDS,
    FAMILY_LABELS,
    WEIGHTS,
    TEXT_EFFECTS,
    CAPTION_BACKGROUNDS,
    DEFAULT_TEXT_STYLE,
    DEFAULT_CAPTION_STYLE,
    normalizeWeight,
    weightPreset,
    weightValue,
    normalizeFamily,
    fontStack,
    normalizeAlign,
    normalizeColor,
    normalizeEffect,
    normalizeBackground,
    contrastOutline,
    outlineWidth,
  };
});
