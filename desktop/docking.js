'use strict';

const STRIP_WIDTH = 760;
const STRIP_MAX_WIDTH = 1280;
const STRIP_HEIGHT = 40;
const DETAILS_HEIGHT = 284;
const SNAP_DISTANCE = 28;
const TITLEBAR_LEFT = 340;
const TITLEBAR_RIGHT = 140;
const TITLEBAR_INSET = 4;
const DEFAULT_PLACEMENT = Object.freeze({ edge: 'top', side: 'inside', align: 'center', offset: 0 });

function clamp(value, min, max) { return Math.max(min, Math.min(Math.max(min, max), value)); }

function titlebarSpace(host) {
  return { left: host.x + TITLEBAR_LEFT, right: host.x + host.width - TITLEBAR_RIGHT };
}

function dockBounds(host, size, workArea, placement = DEFAULT_PLACEMENT) {
  let width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const edge = placement.edge;
  let x = host.x + host.width - width - placement.offset;
  const outside = placement.side !== 'inside';
  let y = outside && host.y + host.height + height + 2 <= workArea.y + workArea.height
    ? host.y + host.height + 2 : host.y + host.height - height - 2;
  if (edge === 'top') {
    if (outside && host.y - height - 2 >= workArea.y) y = host.y - height - 2;
    else {
      const space = titlebarSpace(host);
      const left = Math.max(workArea.x, Math.min(space.left, workArea.x + workArea.width - 1));
      const right = Math.min(workArea.x + workArea.width, Math.max(left + 1, space.right));
      width = Math.min(width, right - left);
      x = placement.align === 'center' ? left + (right - left - width) / 2
        : clamp(host.x + host.width - width - placement.offset, left, right - width);
      y = Math.max(host.y, workArea.y) + TITLEBAR_INSET;
    }
  }
  if (edge === 'left' || edge === 'right') {
    x = edge === 'left'
      ? (outside && host.x - width - 2 >= workArea.x ? host.x - width - 2 : host.x + 2)
      : (outside && host.x + host.width + width + 2 <= workArea.x + workArea.width ? host.x + host.width + 2 : host.x + host.width - width - 2);
    y = host.y + placement.offset;
  }
  return { x: Math.round(clamp(x, workArea.x, workArea.x + workArea.width - width)),
    y: Math.round(clamp(y, workArea.y, workArea.y + workArea.height - height)), width, height };
}

function snapPlacement(bounds, host) {
  const overlapX = bounds.x < host.x + host.width && bounds.x + bounds.width > host.x;
  const overlapY = bounds.y < host.y + host.height && bounds.y + bounds.height > host.y;
  const edges = [
    { edge: 'bottom', side: 'inside', distance: Math.abs(bounds.y + bounds.height - (host.y + host.height - 2)), overlap: overlapX,
      offset: host.x + host.width - bounds.x - bounds.width },
    { edge: 'top', side: 'inside', distance: Math.abs(bounds.y - (host.y + TITLEBAR_INSET)), overlap: overlapX,
      offset: host.x + host.width - bounds.x - bounds.width },
    { edge: 'left', side: 'inside', distance: Math.abs(bounds.x - (host.x + 2)), overlap: overlapY, offset: bounds.y - host.y },
    { edge: 'right', side: 'inside', distance: Math.abs(bounds.x + bounds.width - (host.x + host.width - 2)), overlap: overlapY, offset: bounds.y - host.y },
    { edge: 'bottom', side: 'outside', distance: Math.abs(bounds.y - (host.y + host.height + 2)), overlap: overlapX,
      offset: host.x + host.width - bounds.x - bounds.width },
    { edge: 'top', side: 'outside', distance: Math.abs(bounds.y + bounds.height - (host.y - 2)), overlap: overlapX,
      offset: host.x + host.width - bounds.x - bounds.width },
    { edge: 'left', side: 'outside', distance: Math.abs(bounds.x + bounds.width - (host.x - 2)), overlap: overlapY, offset: bounds.y - host.y },
    { edge: 'right', side: 'outside', distance: Math.abs(bounds.x - (host.x + host.width + 2)), overlap: overlapY, offset: bounds.y - host.y },
  ].filter(candidate => candidate.overlap && candidate.distance <= SNAP_DISTANCE)
    .sort((a, b) => a.distance - b.distance);
  if (!edges[0]) return null;
  const match = { edge: edges[0].edge, side: edges[0].side, offset: Math.max(0, Math.round(edges[0].offset)) };
  if (match.edge === 'top' && match.side === 'inside') {
    const space = titlebarSpace(host);
    if (Math.abs(bounds.x + bounds.width / 2 - (space.left + space.right) / 2) <= SNAP_DISTANCE) match.align = 'center';
  }
  return match;
}

function expandedBounds(strip, expanded, workArea, preferBelow) {
  if (!expanded) return { bounds: strip, detailsBelow: preferBelow };
  const above = Math.max(0, strip.y - workArea.y);
  const below = Math.max(0, workArea.y + workArea.height - strip.y - strip.height);
  const extra = DETAILS_HEIGHT - STRIP_HEIGHT;
  let detailsBelow = preferBelow;
  if ((preferBelow ? below : above) < extra && (preferBelow ? above : below) > (preferBelow ? below : above)) detailsBelow = !preferBelow;
  const added = Math.min(extra, detailsBelow ? below : above);
  return { bounds: { ...strip, y: detailsBelow ? strip.y : strip.y - added, height: strip.height + added }, detailsBelow };
}

module.exports = { dockBounds, snapPlacement, expandedBounds, DEFAULT_PLACEMENT, STRIP_WIDTH, STRIP_MAX_WIDTH, STRIP_HEIGHT, DETAILS_HEIGHT };
