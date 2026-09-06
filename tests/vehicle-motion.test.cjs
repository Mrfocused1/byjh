const test = require('node:test');
const assert = require('node:assert/strict');
require('../dist/vehicle-motion.js');
const { create, clampScroll } = globalThis.BYJHVehicleMotion;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} should equal ${expected}`);
function settle(drive, position, tangent = 0) {
  let state;
  for (let i = 0; i < 100; i++) {
    state = drive.step(position, tangent, 16.7);
    if (!state.turning) return state;
  }
  assert.fail('The turn must finish after scrolling stops');
}

test('reversals face back along any road tangent, then face forward again', () => {
  for (const tangent of [-180, -90, -45, 0, 45, 90, 179]) {
    const drive = create(200);
    close(drive.step(300, tangent, 16.7).heading, tangent);
    const turning = drive.step(290, tangent, 16.7);
    assert.equal(turning.direction, -1);
    assert.ok(turning.yaw > 0 && turning.yaw < 180);
    const reverse = settle(drive, 290, tangent);
    close(reverse.heading, tangent + 180);
    close(reverse.yaw, 180);
    drive.step(310, tangent, 16.7);
    close(settle(drive, 310, tangent).heading, tangent);
  }
});

test('reversing a turn in progress continues from its current angle', () => {
  const drive = create(100);
  const a = drive.step(90, -90, 16.7);
  const b = drive.step(80, -90, 16.7);
  assert.ok(b.yaw > a.yaw);
  const c = drive.step(95, -90, 16.7);
  assert.equal(c.direction, 1);
  assert.ok(c.yaw > 0 && c.yaw < b.yaw);
  close(settle(drive, 95, -90).heading, -90);
});

test('slow scrolling accumulates a reversal; subpixel noise does not', () => {
  const drive = create(100);
  for (const position of [100.2, 99.8, 100.1, 99.5]) {
    assert.equal(drive.step(position, 0, 16.7).direction, 1);
  }
  for (const position of [99, 98.5, 98, 97.5]) drive.step(position, 0, 16.7);
  assert.equal(settle(drive, 97.5).direction, -1);
});

test('a road heading across the angle boundary does not make a full spin', () => {
  const drive = create();
  const a = drive.step(0, 179, 16.7);
  const b = drive.step(10, -179, 16.7);
  close(b.heading - a.heading, 2);
  const c = drive.step(20, 179, 16.7);
  close(c.heading - b.heading, -2);
});

test('wheels roll forwards relative to the van after mirroring and stop at rest', () => {
  const drive = create();
  drive.roll(0, 40);
  const forward = drive.roll(20, 40);
  assert.ok(forward > 0);
  drive.step(100, 0, 16.7);
  drive.step(90, 0, 16.7);
  const facing = settle(drive, 90);
  const reverse = drive.roll(10, 40);
  assert.ok(reverse > forward);
  // RotateY(180) reflects the local clockwise rotation into world anticlockwise.
  assert.ok((reverse - forward) * Math.cos(facing.yaw * Math.PI / 180) < 0);
  close(drive.roll(10, 40), reverse);
  drive.rebase(400);
  close(drive.roll(1000, 20), reverse); // No wheel jump when layout sizes change.
  assert.equal(drive.step(400, 0, 16.7).direction, -1);
});

test('motion-off is static and page overscroll cannot fabricate a reversal', () => {
  const drive = create(100);
  drive.step(90, 0, 16.7);
  const off = drive.step(80, -90, 16.7, false);
  assert.equal(off.turning, false);
  close(off.yaw, 0);
  close(off.heading, -90);
  close(drive.roll(100, 40, false), 0);
  close(drive.roll(200, 40, false), 0);
  const edge = create(1000);
  for (const scroll of [1010, 1050, 1030, 1000]) {
    assert.equal(edge.step(clampScroll(scroll, 1000), 0, 16.7).direction, 1);
  }
  close(clampScroll(-80, 1000), 0);
  close(clampScroll(10, -10), 0);
});
