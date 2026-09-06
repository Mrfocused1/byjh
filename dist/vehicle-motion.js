/* Shared steering for the overhead roads and the side-on fleet story. */
(() => {
  'use strict';
  const angleDelta = (from, to) => ((to - from + 180) % 360 + 360) % 360 - 180;
  const clampScroll = (position, maximum) => Math.min(Math.max(0, maximum), Math.max(0, position));

  function create(initialScroll = 0) {
    let direction = 1, extreme = initialScroll;
    let tangent = null, turn = 0;
    let wheelDistance = null, wheelAngle = 0;
    return {
      // Layout changes and restored pages are not changes in travel direction.
      rebase(position) { extreme = position; wheelDistance = null; },
      step(position, pathAngle, elapsed, enabled = true) {
        // Track the peak rather than individual events: slow gestures still
        // reverse the van, while subpixel scroll noise cannot make it flicker.
        if (enabled) {
          extreme = direction > 0 ? Math.max(extreme, position) : Math.min(extreme, position);
          if ((position - extreme) * direction <= -2) {
            direction *= -1;
            extreme = position;
          }
        } else extreme = position;

        // Unwrap the road tangent separately so crossing +/-180 on a bend
        // cannot add a full revolution to the turnaround.
        tangent = tangent === null ? pathAngle : tangent + angleDelta(tangent, pathAngle);
        const target = enabled && direction < 0 ? 180 : 0;
        const easing = enabled ? 1 - Math.exp(-Math.max(0, elapsed) / 85) : 1;
        turn += (target - turn) * easing;
        if (Math.abs(target - turn) < .1) turn = target;
        return { direction, heading: tangent + turn, yaw: turn, turning: turn !== target };
      },
      roll(distance, radius, enabled = true) {
        if (!enabled) wheelAngle = 0;
        else if (wheelDistance !== null) {
          // The mirrored body reverses the wheel's world-space rotation.
          // Advance its local face forwards in both directions, retaining the
          // same phase when turning and stopping as soon as travel stops.
          wheelAngle = (wheelAngle + Math.abs(distance - wheelDistance) / Math.max(1, radius) * 180 / Math.PI) % 360;
        }
        wheelDistance = distance;
        return wheelAngle;
      }
    };
  }
  globalThis.BYJHVehicleMotion = { create, clampScroll };
})();
