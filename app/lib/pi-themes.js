'use strict';

const { SELECT_ARROW_CSS } = require('./pi-theme');

const SD_PI_THEME = `
<style id="ulanzi-sd-theme">
  :root, html {
    color-scheme: dark;
    --bg: #0b0f16 !important;
    --field: #141a25 !important;
    --text: #e8ecf4 !important;
    --label: #8b95a7 !important;
    --sdpi-bgcolor: #0b0f16 !important;
    --sdpi-color: #e8ecf4 !important;
    --sdpi-background: #141a25 !important;
  }
  html, body {
    background: #0b0f16 !important;
    color: #e8ecf4 !important;
  }
  select, input, textarea, button {
    box-sizing: border-box !important;
    min-width: 0 !important;
    max-width: 100% !important;
    background: #141a25 !important;
    color: #e8ecf4 !important;
    border-color: #2a3342 !important;
    border-radius: 8px !important;
  }
${SELECT_ARROW_CSS}
  select:focus, input:focus, textarea:focus, button:focus {
    outline: none !important;
    border-color: #4f8cff !important;
  }
  input[type="checkbox"], input[type="radio"] { accent-color: #4f8cff !important; }
  a { color: #6ea8ff !important; }
</style>`;

const PI_THEME = `
<style id="ulanzi-deck-open-theme">
  :root { color-scheme: dark; }
  html { scrollbar-gutter: stable; }
  html, body {
    background: #0b0f16 !important;
    color: #e8ecf4 !important;
    font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif !important;
    font-size: 12px !important;
    margin: 0 !important;
  }
  body { padding: 0 12px 8px 0 !important; }
  .udpi-wrapper, .uspi-wrapper { background: transparent !important; }
  .uspi-heading, .udpi-heading {
    color: #8b95a7 !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
    letter-spacing: 1.2px !important;
    text-transform: uppercase !important;
    border-bottom: 1px solid #232a36 !important;
    padding: 10px 0 6px !important;
    margin: 0 0 8px !important;
  }
  input, select, textarea {
    box-sizing: border-box !important;
    min-width: 0 !important;
    max-width: 100% !important;
    background: #141a25 !important;
    border: 1px solid #2a3342 !important;
    border-radius: 8px !important;
    color: #e8ecf4 !important;
    font-family: inherit !important;
    font-size: 12px !important;
    padding: 7px 9px !important;
  }
${SELECT_ARROW_CSS}
  /* Buttons keep the plugin's own layout (height/line-height/padding) and only
     borrow the app's colour and border treatment. */
  button {
    background: #141a25 !important;
    border: 1px solid #2a3342 !important;
    border-radius: 8px !important;
    color: #e8ecf4 !important;
    font-family: inherit !important;
    font-size: 12px !important;
  }
  input[type="checkbox"], input[type="radio"] { accent-color: #4f8cff !important; width: 14px; height: 14px; }
  input:focus, select:focus, textarea:focus { outline: none !important; border-color: #4f8cff !important; }
  label { color: #e8ecf4 !important; }
  a { color: #6ea8ff !important; }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.035) !important;
    border-radius: 8px !important;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.24) !important;
    border: 2px solid transparent !important;
    background-clip: content-box !important;
    border-radius: 8px !important;
  }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.38) !important; background-clip: content-box !important; }
  ::-webkit-scrollbar-thumb:active { background: rgba(255, 255, 255, 0.5) !important; background-clip: content-box !important; }
  ::-webkit-scrollbar-corner { background: transparent !important; }
</style>`;

module.exports = { SD_PI_THEME, PI_THEME };
