'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('smol-toml');

const DEFAULTS = {
  light: { surface: '#ffffff', ink: '#1a1c1f', accent: '#339cff', danger: '#ba2623' },
  dark: { surface: '#181818', ink: '#ffffff', accent: '#339cff', danger: '#fa423e' },
};

function color(value, fallback) { return /^#[\da-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback; }

function mix(foreground, background, amount) {
  const channel = (hex, offset) => parseInt(hex.slice(offset, offset + 2), 16);
  return '#' + [1, 3, 5].map(offset => Math.round(channel(foreground, offset) * amount
    + channel(background, offset) * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

function themeFromConfig(config, systemDark) {
  const desktop = config.desktop || {};
  const mode = ['light', 'dark'].includes(desktop.appearanceTheme) ? desktop.appearanceTheme : systemDark ? 'dark' : 'light';
  const seed = desktop[mode === 'dark' ? 'appearanceDarkChromeTheme' : 'appearanceLightChromeTheme'] || {};
  const defaults = DEFAULTS[mode];
  const surface = color(seed.surface, defaults.surface);
  const text = color(seed.ink, defaults.ink);
  const accent = color(seed.accent, defaults.accent);
  return {
    mode,
    colors: {
      surface,
      surfaceFill: seed.opaqueWindows === true ? surface : surface + 'e6',
      text,
      muted: mix(text, surface, 0.52),
      line: mix(text, surface, 0.12),
      accent,
      accentText: mix(accent, text, 0.75),
      accentSoft: mix(accent, surface, 0.1),
      hover: mix(text, surface, 0.06),
      grip: mix(text, surface, 0.3),
      danger: color(seed.semanticColors?.diffRemoved, defaults.danger),
    },
  };
}

class CodexTheme {
  constructor(codexHome, { loadConfig = () => parse(fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8')) } = {}) {
    this.loadConfig = loadConfig;
    this.config = {};
    this.theme = null;
    this.viewKey = undefined;
  }

  forView(viewKey, systemDark) {
    if (this.theme && (this.viewKey === undefined || this.viewKey === viewKey)) {
      this.viewKey = viewKey;
      return this.theme;
    }
    try { this.config = this.loadConfig(); } catch { /* Keep the last complete configuration during an editor save. */ }
    this.theme = themeFromConfig(this.config, systemDark);
    this.viewKey = viewKey;
    return this.theme;
  }
}

module.exports = { CodexTheme, themeFromConfig };
