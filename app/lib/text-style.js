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
  const WEIGHTS = { light: 300, regular: 400, bold: 700 };
  const CAPTION_BACKGROUNDS = ['gradient', 'solid', 'none'];
  const DEFAULT_TEXT_STYLE = {
    family: 'system',
    weight: 700,
    color: '#ffffff',
  };
  const DEFAULT_CAPTION_STYLE = {
    family: 'system',
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
    const weight = clampWeight(value, 400);
    if (weight < 350) return 'light';
    if (weight < 650) return 'regular';
    return 'bold';
  }

  function weightValue(preset) {
    return WEIGHTS[preset] || WEIGHTS.regular;
  }

  /** Snap legacy numeric weights to one of the three rendered presets. */
  function normalizeWeightPreset(value, fallback = 400) {
    const preset = weightPreset(Number.isFinite(Number(value)) ? value : fallback);
    return WEIGHTS[preset] || fallback;
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

  function normalizeBackground(value, fallback = 'gradient') {
    return CAPTION_BACKGROUNDS.includes(value) ? value : fallback;
  }

  return {
    FAMILIES,
    FAMILY_IDS,
    FAMILY_LABELS,
    WEIGHTS,
    CAPTION_BACKGROUNDS,
    DEFAULT_TEXT_STYLE,
    DEFAULT_CAPTION_STYLE,
    normalizeWeight,
    normalizeWeightPreset,
    weightPreset,
    weightValue,
    normalizeFamily,
    fontStack,
    normalizeAlign,
    normalizeColor,
    normalizeBackground,
  };
});
