'use strict';

function trimFixed(value, digits) {
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return trimFixed(n / 1_000_000_000, 1) + 'B';
  if (abs >= 1_000_000) return trimFixed(n / 1_000_000, 1) + 'M';
  if (abs >= 1_000) return trimFixed(n / 1_000, 1) + 'k';
  return String(Math.round(n));
}

function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  if (Math.abs(n) < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

module.exports = { formatTokens, formatUsd };
