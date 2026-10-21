'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { dockBounds, snapPlacement, expandedBounds, foldedBounds, titlebarSpace, DEFAULT_PLACEMENT,
  STRIP_MAX_WIDTH, FOLDED_WIDTH } = require('../desktop/docking');

const work = { x: 0, y: 0, width: 1600, height: 1000 };
const host = { x: 100, y: 100, width: 1000, height: 600 };
const size = { width: 760, height: 40 };

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
  assert.deepEqual(first, { x: 520, y: 104, width: 760, height: 40 });
  const resized = dockBounds({ ...wide, width: 1500 }, size, work);
  assert.equal(resized.x - first.x, 50);
  assert.equal(resized.y, first.y);
  assert.ok(first.x >= wide.x + 340);
  assert.ok(first.x + first.width <= wide.x + wide.width - 140);
});

test('narrow titlebars shrink the strip while retaining both control margins', () => {
  const result = dockBounds(host, size, work);
  assert.deepEqual(result, { x: 440, y: 104, width: 520, height: 40 });
});

test('adaptive titlebar width grows with the host and stops at the content limit', () => {
  const display = { x: 0, y: 0, width: 3000, height: 1600 };
  const widthAt = width => dockBounds({ x: 0, y: 0, width, height: 1000 }, { ...size, width: STRIP_MAX_WIDTH }, display).width;
  assert.equal(widthAt(1000), 520);
  assert.equal(widthAt(1400), 920);
  assert.equal(widthAt(1700), 1220);
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

test('top docking and downward expansion preserve the strip position on negative monitors', () => {
  const display = { x: -1600, y: -1000, width: 1600, height: 1000 };
  const window = { ...display, height: 900 };
  const strip = dockBounds(window, size, display);
  assert.equal(strip.y, -996);
  assert.equal(snapPlacement(strip, window).align, 'center');
  const expanded = expandedBounds(strip, true, display, true);
  assert.equal(expanded.detailsBelow, true);
  assert.deepEqual(expanded.bounds, { ...strip, height: 284 });
  assert.deepEqual(expandedBounds(strip, false, display, true).bounds, strip);
});

test('bottom expansion grows upward and shallow displays retain the strip anchor', () => {
  const strip = dockBounds(host, size, work, { edge: 'bottom', offset: 16 });
  const expanded = expandedBounds(strip, true, work, false);
  assert.equal(expanded.detailsBelow, false);
  assert.equal(expanded.bounds.y + expanded.bounds.height, strip.y + strip.height);
  const shallow = { x: 0, y: 0, width: 800, height: 200 };
  const nearBottom = { x: 10, y: 150, width: 760, height: 40 };
  const flipped = expandedBounds(nearBottom, true, shallow, true);
  assert.equal(flipped.detailsBelow, false);
  assert.equal(flipped.bounds.y, 0);
  assert.equal(flipped.bounds.y + flipped.bounds.height, nearBottom.y + nearBottom.height);
  assert.deepEqual(DEFAULT_PLACEMENT, { edge: 'top', side: 'inside', align: 'center', offset: 0 });
});

test('folded titlebar handle moves to the right beyond the centered content limit', () => {
  const display = { x: 0, y: 0, width: 3000, height: 1600 };
  const wide = { x: 100, y: 100, width: 2400, height: 1000 };
  const strip = dockBounds(wide, { ...size, width: STRIP_MAX_WIDTH }, display);
  const folded = foldedBounds(strip, display, titlebarSpace(wide).right);
  assert.equal(folded.width, FOLDED_WIDTH);
  assert.equal(folded.x + folded.width, wide.x + wide.width - 140);
  assert.ok(folded.x > strip.x + strip.width);
  assert.equal(folded.y, strip.y);
  assert.equal(folded.height, size.height);
  assert.equal(strip.width, STRIP_MAX_WIDTH);
});

test('floating fold preserves the original right edge and full strip bounds', () => {
  const strip = { x: 250, y: 350, width: 760, height: 40 };
  assert.deepEqual(foldedBounds(strip, work), { x: 978, y: 350, width: FOLDED_WIDTH, height: 40 });
  assert.deepEqual(expandedBounds(strip, false, work, true).bounds, strip);
});

test('folded handles remain accessible on negative monitors and partially offscreen hosts', () => {
  const display = { x: -1600, y: -1000, width: 1600, height: 1000 };
  const strip = { x: -1260, y: -996, width: 1120, height: 40 };
  assert.deepEqual(foldedBounds(strip, display), { x: -172, y: -996, width: FOLDED_WIDTH, height: 40 });
  const clamped = foldedBounds({ ...strip, y: -1100 }, display, 600);
  assert.equal(clamped.x + clamped.width, 0);
  assert.equal(clamped.y, -1000);
});
