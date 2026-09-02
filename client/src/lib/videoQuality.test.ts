/**
 * Which simulcast layer a tile asks for.
 *
 * Pure arithmetic, and worth pinning because getting it wrong is invisible in
 * development and expensive in a real room: too high and a phone decodes eleven
 * 720p streams into stamps, too low and every face is a smear. Both look like
 * "the video is bad" and neither points at this file.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { qualityForWidth, tableQualityPlan } from './videoQuality.js';

/*
 * Measured from the real layouts (see ringShape.test.ts for where these come
 * from), with the device pixel ratio each screen actually reports.
 */
const PHONE_SEAT = { css: 89, dpr: 3 };    // twelve at a table, 4 across
const PHONE_STAGE = { css: 176, dpr: 3 };  // the host, between the side columns
const LAPTOP_SEAT = { css: 294, dpr: 2 };
const LAPTOP_STAGE = { css: 620, dpr: 2 };

test('a phone seat asks for the smallest layer', () => {
  // 89 points at 3× is 267 real pixels. The 320-wide rung covers it; the
  // 1280-wide one is twenty-three times the pixels for the same square.
  assert.equal(qualityForWidth(PHONE_SEAT.css, PHONE_SEAT.dpr), 'low');
});

test('a laptop seat asks for the middle layer, not the top one', () => {
  // 588 real pixels: 320 would be visibly soft at this size, 1280 is waste.
  assert.equal(qualityForWidth(LAPTOP_SEAT.css, LAPTOP_SEAT.dpr), 'medium');
});

test('only a big stage asks for the top layer', () => {
  assert.equal(qualityForWidth(LAPTOP_STAGE.css, LAPTOP_STAGE.dpr), 'high');
  // A phone's centre stage is not big. This is the whole reason a table full of
  // phones costs the publishers nothing at 720: nobody subscribes to it, and
  // dynacast stops encoding it.
  assert.equal(qualityForWidth(PHONE_STAGE.css, PHONE_STAGE.dpr), 'medium');
});

test('the device pixel ratio counts', () => {
  /*
   * The bug this guards: choosing from CSS pixels alone. A 200-point tile is
   * 200 pixels on a monitor and 600 on a phone, and picking 320 lines for the
   * second is a smear on the one screen held closest to the face.
   */
  assert.equal(qualityForWidth(200, 1), 'low');
  assert.equal(qualityForWidth(200, 3), 'medium');
});

test('an unmeasured tile asks for the least, not the most', () => {
  /*
   * A box is 0 for the frame between mount and the first ResizeObserver
   * callback. Treating that as "unknown, so send everything" is how a table
   * briefly pulls twelve 720p streams every time it opens.
   */
  for (const bad of [0, -50, NaN, undefined as any]) {
    assert.equal(qualityForWidth(bad, 3), 'low', `width ${bad}`);
  }
  // A missing dpr must not silently divide the request either.
  assert.equal(qualityForWidth(400, 0 as any), 'medium');
});

test('the plan gives every seat the seat size and the host the stage size', () => {
  const plan = tableQualityPlan({
    seatIds: ['a', 'b', 'c', 'host'],
    seatWidth: LAPTOP_SEAT.css,
    hostId: 'host',
    hostWidth: LAPTOP_STAGE.css,
    dpr: 2,
  });
  assert.equal(plan.get('a'), 'medium');
  assert.equal(plan.get('b'), 'medium');
  assert.equal(plan.get('c'), 'medium');
  // The host is in the seat list too when they hold a seat; the stage wins.
  assert.equal(plan.get('host'), 'high');
  assert.equal(plan.size, 4);
});

test('on a phone nobody asks for the top layer', () => {
  /*
   * The property that makes the fix cheap for senders as well as receivers:
   * with no subscriber on the top rung, dynacast stops it being encoded at all.
   */
  const plan = tableQualityPlan({
    seatIds: Array.from({ length: 12 }, (_, i) => `p${i}`),
    seatWidth: PHONE_SEAT.css,
    hostId: 'host',
    hostWidth: PHONE_STAGE.css,
    dpr: 3,
  });
  assert.equal([...plan.values()].filter(q => q === 'high').length, 0);
  assert.equal([...plan.values()].filter(q => q === 'low').length, 12);
});
