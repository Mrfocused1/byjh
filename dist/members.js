/* Members: the homepage road winds down the page, switching sides between members.
   The van follows it on scroll and uncovers each member as it drives alongside. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const pad = n => String(n).padStart(2, '0');

  const journey = $('#members');
  if (!journey || !window.BYJH || !window.BYJHVehicleMotion) return;
  const road = $('#road'), surface = $('.road-surface', road), traveller = $('#traveller');
  const blocks = $$('.member', journey), turns = $$('.road-turn', journey), exit = $('.road-exit', journey);
  const progressBar = $('.page-progress i'), indicator = $('.chapter-indicator');
  const chapterNumber = $('.chapter-number'), chapterLabel = $('.chapter-label'), chapterPercent = $('.chapter-percent');
  const members = blocks.filter(b => !b.classList.contains('member-open'));

  // Sides alternate automatically: the road runs beside the first member on the right.
  blocks.forEach((block, i) => {
    block.classList.toggle('path-clear-right', i % 2 === 0);
    block.classList.toggle('path-clear-left', i % 2 === 1);
  });
  members.forEach((block, i) => { const no = $('.member-no span', block); if (no) no.textContent = `${pad(i + 1)} / ${pad(members.length)}`; });
  $$('.members-total').forEach(el => { el.textContent = members.length; });
  const labels = blocks.map((block, i) => block.classList.contains('member-open')
    ? ['NEXT', 'YOUR NAME HERE']
    : [pad(i + 1), $('.member-name', block).textContent.trim().toUpperCase()]);
  document.body.classList.add('members-ready');

  let motion = window.BYJH.motion;
  let metrics = null, dirty = true, frame = 0, previousTime = 0;
  let actualScroll = window.BYJH.scrollPosition(), renderedScroll = actualScroll, renderedLength = 0;
  const revealed = blocks.map(() => 0);
  const vehicleMotion = window.BYJHVehicleMotion.create(renderedScroll);

  function measure() {
    const width = journey.clientWidth, viewportHeight = innerHeight;
    const mobile = width <= 760;
    const rw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--road-width'));
    const sideInset = mobile ? (width <= 360 ? 47 : 56) : Math.max(rw * .72, width * .105);
    const left = sideInset, right = width - sideInset;
    const bend = mobile ? 84 : Math.min(150, width * .14);
    const startY = 52;

    // Build the road one piece at a time, recording where each vertical run begins and ends so
    // scrolling can be mapped to distance along the road, bends included.
    const parts = [];
    const lengthSoFar = () => { surface.setAttribute('d', parts.join(' ')); return surface.getTotalLength(); };
    const anchors = [{ y: startY - 220, length: 0 }];
    parts.push(`M ${-rw * 2} ${startY}`, `L ${right - bend} ${startY}`, `Q ${right} ${startY} ${right} ${startY + bend}`);
    anchors.push({ y: startY + bend, length: lengthSoFar() });
    let x = right;
    for (const turn of turns) {
      const radius = Math.min(turn.offsetHeight / 2, (right - left) / 2);
      const mid = turn.offsetTop + turn.offsetHeight / 2, from = mid - radius, to = mid + radius;
      parts.push(`L ${x} ${from}`);
      anchors.push({ y: from, length: lengthSoFar() });
      if (x === right) parts.push(`A ${radius} ${radius} 0 0 1 ${right - radius} ${mid}`, `L ${left + radius} ${mid}`, `A ${radius} ${radius} 0 0 0 ${left} ${to}`);
      else parts.push(`A ${radius} ${radius} 0 0 0 ${left + radius} ${mid}`, `L ${right - radius} ${mid}`, `A ${radius} ${radius} 0 0 1 ${right} ${to}`);
      x = x === right ? left : right;
      anchors.push({ y: to, length: lengthSoFar() });
    }
    // Leave through the right-hand edge, with enough road for the whole rotated sprite.
    const exitRadius = Math.max(110, rw * 1.35), exitY = exit.offsetTop + 30;
    const top = journey.getBoundingClientRect().top + scrollY;
    // The van must be clear of the page before scrolling runs out.
    const lastVanY = document.documentElement.scrollHeight - viewportHeight + viewportHeight * .57 - top;
    const exitSpan = Math.max(120, Math.min(650, viewportHeight * .65, lastVanY - exitY - 10));
    parts.push(`L ${x} ${exitY}`);
    anchors.push({ y: exitY, length: lengthSoFar() });
    parts.push(`A ${exitRadius} ${exitRadius} 0 0 0 ${x + exitRadius} ${exitY + exitRadius}`, `L ${width + rw * 3.3} ${exitY + exitRadius}`);
    const pathLength = lengthSoFar();
    anchors.push({ y: exitY + exitSpan, length: pathLength });

    road.setAttribute('width', width);
    road.setAttribute('height', journey.offsetHeight);
    $$('path', road).forEach(path => path.setAttribute('d', parts.join(' ')));
    metrics = {
      top, viewportHeight, anchors, pathLength,
      blocks: blocks.map(b => ({ top: b.offsetTop, height: b.offsetHeight })),
      end: exitY
    };
    renderedLength = distanceForY(renderedScroll + viewportHeight * .57 - top);
    vehicleMotion.rebase(renderedScroll);
    dirty = false;
  }

  function distanceForY(y) {
    const a = metrics.anchors;
    if (y <= a[0].y) return 0;
    for (let i = 1; i < a.length; i++) {
      if (y <= a[i].y) return lerp(a[i - 1].length, a[i].length, (y - a[i - 1].y) / Math.max(1, a[i].y - a[i - 1].y));
    }
    return metrics.pathLength;
  }

  function render(time) {
    frame = 0;
    if (dirty || !metrics) measure();
    const elapsed = Math.min(64, previousTime ? time - previousTime : 16.7);
    previousTime = time;
    const ease = motion ? 1 - Math.exp(-elapsed / 62) : 1;
    renderedScroll = lerp(renderedScroll, actualScroll, ease);
    if (Math.abs(renderedScroll - actualScroll) < .12) renderedScroll = actualScroll;
    const y = renderedScroll, vh = metrics.viewportHeight;

    const targetLength = distanceForY(y + vh * .57 - metrics.top);
    renderedLength = lerp(renderedLength, targetLength, motion ? Math.min(1, ease * 1.45) : 1);
    const point = surface.getPointAtLength(renderedLength);
    const before = surface.getPointAtLength(Math.max(0, renderedLength - 4));
    const after = surface.getPointAtLength(Math.min(metrics.pathLength, renderedLength + 4));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI - 90;
    const steering = vehicleMotion.step(y, angle, elapsed, motion);
    traveller.style.transform = `translate3d(${point.x}px,${point.y}px,0) rotate(${steering.heading}deg)`;
    traveller.style.opacity = motion ? String(smooth((y + vh * .65 - metrics.top + 40) / 150)) : '0';

    // Each member is uncovered from the top as the van passes, and stays uncovered.
    let active = 0;
    metrics.blocks.forEach((b, i) => {
      if (point.y >= b.top) active = i;
      const amount = motion ? Math.max(revealed[i], smooth((point.y - b.top - b.height * .12) / (b.height * .5))) : 1;
      if (amount !== revealed[i] || !blocks[i].style.getPropertyValue('--reveal')) {
        revealed[i] = amount;
        blocks[i].style.setProperty('--reveal', amount.toFixed(4));
      }
    });

    const total = clamp(actualScroll / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    if (progressBar) progressBar.style.transform = `scaleX(${total})`;
    const percent = `${Math.round(total * 100)}%`;
    if (chapterPercent.textContent !== percent) chapterPercent.textContent = percent;
    const [number, label] = labels[active];
    if (chapterNumber.textContent !== number) chapterNumber.textContent = number;
    if (chapterLabel.textContent !== label) chapterLabel.textContent = label;
    indicator.classList.toggle('visible', motion && y > metrics.top - 170 && y + vh * .57 < metrics.top + metrics.end);

    if (renderedScroll !== actualScroll || Math.abs(renderedLength - targetLength) > .2 || steering.turning) request();
  }
  function request() { if (!frame) frame = requestAnimationFrame(render); }

  addEventListener('scroll', () => { actualScroll = window.BYJH.scrollPosition(); request(); }, { passive: true });
  addEventListener('resize', () => { dirty = true; actualScroll = window.BYJH.scrollPosition(); request(); }, { passive: true });
  addEventListener('pageshow', () => { actualScroll = renderedScroll = window.BYJH.scrollPosition(); dirty = true; request(); });
  addEventListener('byjh:motion', e => { motion = e.detail; dirty = true; request(); });
  document.fonts.ready.then(() => { dirty = true; request(); });
  new ResizeObserver(() => { dirty = true; request(); }).observe(journey);
  request();
})();
