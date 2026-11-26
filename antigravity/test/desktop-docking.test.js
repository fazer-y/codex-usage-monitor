'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { dockBounds, snapPlacement, foldedBounds, titlebarSpace, DEFAULT_PLACEMENT,
  STRIP_WIDTH, STRIP_MAX_WIDTH, STRIP_HEIGHT, FOLDED_WIDTH } = require('../desktop/docking');

const work = { x: 0, y: 0, width: 1600, height: 1000 };
const host = { x: 100, y: 100, width: 1000, height: 600 };
const size = { width: STRIP_WIDTH, height: STRIP_HEIGHT };

test('bottom docking uses space outside the host and follows movement', () => {
  const placement = { edge: 'bottom', offset: 16 };
  const first = dockBounds(host, size, work, placement);
  const moved = dockBounds({ ...host, x: 150, y: 180 }, size, work, placement);
  assert.equal(first.y, 702);
  assert.equal(moved.x - first.x, 50);
  assert.equal(moved.y - first.y, 80);
});
test('maximized hosts keep the entire strip in the work area', () => {
  const result = dockBounds({ x: -8, y: -8, width: 1616, height: 1016 }, size, work);
  assert.ok(result.x >= 0 && result.y >= 0);
  assert.ok(result.x + result.width <= work.width);
  assert.ok(result.y + result.height <= work.height);
});
test('magnetic docking recognizes inside and outside edges and releases when far away', () => {
  assert.equal(snapPlacement({ x: 300, y: 702, width: 760, height: 40 }, host).side, 'outside');
  assert.equal(snapPlacement({ x: 300, y: 658, width: 760, height: 40 }, host).side, 'inside');
  assert.equal(snapPlacement({ x: 300, y: 350, width: 600, height: 40 }, host), null);
});
test('negative monitor origins and narrow screens remain visible', () => {
  const display = { x: -800, y: 0, width: 800, height: 600 };
  const result = dockBounds({ x: -800, y: 0, width: 800, height: 600 }, { width: 1000, height: 284 }, display, { edge: 'bottom', offset: 16 });
  assert.equal(result.width, 800);
  assert.equal(result.x, -800);
  assert.ok(result.y >= 0 && result.y + result.height <= 600);
});

test('default docking centers within the titlebar free of menus and window controls', () => {
  const wide = { x: 100, y: 100, width: 1400, height: 800 };
  const first = dockBounds(wide, size, work);
  assert.deepEqual(first, { x: 730, y: 104, width: STRIP_WIDTH, height: STRIP_HEIGHT });
  const resized = dockBounds({ ...wide, width: 1500 }, size, work);
  assert.equal(resized.x - first.x, 50);
  assert.equal(resized.y, first.y);
  assert.ok(first.x >= wide.x + 340);
  assert.ok(first.x + first.width <= wide.x + wide.width - 140);
});

test('narrow titlebars shrink the strip while retaining both control margins', () => {
  const result = dockBounds({ ...host, width: 650 }, size, work);
  assert.deepEqual(result, { x: 440, y: 104, width: 170, height: STRIP_HEIGHT });
});

test('the titlebar strip grows within its width cap as the host expands', () => {
  const display = { x: 0, y: 0, width: 3000, height: 1600 };
  const adaptiveSize = { ...size, maxWidth: STRIP_MAX_WIDTH };
  const widthAt = width => dockBounds({ x: 0, y: 0, width, height: 1000 }, adaptiveSize, display).width;
  assert.equal(widthAt(650), 170);
  assert.equal(widthAt(1000), STRIP_WIDTH);
  assert.equal(widthAt(1200), 468);
  assert.equal(widthAt(1400), 598);
  assert.equal(widthAt(2400), STRIP_MAX_WIDTH);
});

test('dragging into the titlebar center enables centering on later resizes', () => {
  const wide = { x: 100, y: 100, width: 1400, height: 800 };
  const anchor = dockBounds(wide, size, work);
  const placement = snapPlacement(anchor, wide);
  assert.equal(placement.side, 'inside');
  assert.equal(placement.align, 'center');
  assert.deepEqual(dockBounds(wide, size, work, placement), anchor);
  const outside = snapPlacement({ ...anchor, y: wide.y - size.height - 2 }, wide);
  assert.equal(outside.side, 'outside');
});

test('top docking preserves the strip position on negative monitors', () => {
  const display = { x: -1600, y: -1000, width: 1600, height: 1000 };
  const window = { ...display, height: 900 };
  const strip = dockBounds(window, size, display);
  assert.equal(strip.y, -996);
  assert.equal(snapPlacement(strip, window).align, 'center');
  assert.deepEqual(DEFAULT_PLACEMENT, { edge: 'top', side: 'inside', align: 'center', offset: 0 });
});

test('folded titlebar handle moves to the right beyond the centered content limit', () => {
  const display = { x: 0, y: 0, width: 3000, height: 1600 };
  const wide = { x: 100, y: 100, width: 2400, height: 1000 };
  const strip = dockBounds(wide, size, display);
  const folded = foldedBounds(strip, display, titlebarSpace(wide).right);
  assert.equal(folded.width, FOLDED_WIDTH);
  assert.equal(folded.x + folded.width, wide.x + wide.width - 140);
  assert.ok(folded.x > strip.x + strip.width);
  assert.equal(folded.y, strip.y);
  assert.equal(folded.height, size.height);
  assert.equal(strip.width, STRIP_WIDTH);
});

test('floating fold preserves the original right edge and full strip bounds', () => {
  const strip = { x: 250, y: 350, width: 760, height: 40 };
  assert.deepEqual(foldedBounds(strip, work), { x: 1010 - FOLDED_WIDTH, y: 350, width: FOLDED_WIDTH, height: 40 });
});

test('folded handles remain accessible on negative monitors and partially offscreen hosts', () => {
  const display = { x: -1600, y: -1000, width: 1600, height: 1000 };
  const strip = { x: -1260, y: -996, width: 1120, height: 40 };
  assert.deepEqual(foldedBounds(strip, display), { x: -140 - FOLDED_WIDTH, y: -996, width: FOLDED_WIDTH, height: 40 });
  const clamped = foldedBounds({ ...strip, y: -1100 }, display, 600);
  assert.equal(clamped.x + clamped.width, 0);
  assert.equal(clamped.y, -1000);
});
