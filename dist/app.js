/* The route and vehicle share the same path. Scroll changes the distance along it;
   it never starts a time-based drive, so the story stays reversible. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
  let motion = window.BYJH.motion;
  const journey = $('#journey');
  const road = $('#road');
  const surface = $('.road-surface');
  const traveller = $('#traveller');
  const heroVehicle = $('.hero-vehicle');
  const sideVehicle = $('#side-vehicle');
  const profileVehicle = $('.profile-vehicle');
  const perspective = $('#perspective');
  const horizontalSticky = $('.horizontal-sticky');
  const horizontalWindow = $('.horizontal-window');
  const horizontalTrack = $('.horizontal-track');
  const horizontalPanels = $$('.horizontal-panel');
  const horizontalCount = $('#horizontal-count');
  const horizontalChapter = $('#horizontal-chapter');
  const horizontalMeter = $('.horizontal-meter i');
  const horizontalPrevious = $('#horizontal-prev');
  const horizontalNext = $('#horizontal-next');
  const sideWord = $('.side-word');
  let activeHorizontalPanel = 0;
  const progressBar = $('.page-progress i');
  const indicator = $('.chapter-indicator');
  const chapterNumber = $('.chapter-number');
  const chapterLabel = $('.chapter-label');
  const chapterPercent = $('.chapter-percent');
  const chapters = $$('.chapter');
  let metrics, samples = [], pathLength = 0;
  const scrollPosition = window.BYJH.scrollPosition;
  let actualScroll = scrollPosition(), renderedScroll = actualScroll, frame = 0, previousTime = 0;
  const vehicleMotion = window.BYJHVehicleMotion.create(renderedScroll);
  const storyMotion = window.BYJHVehicleMotion.create(actualScroll);
  let targetLength = 0, renderedLength = 0, geometryDirty = false;

  function measure() {
    const width = journey.clientWidth;
    const mobile = width <= 760;
    const horizontalEnabled = motion && innerHeight >= 560;
    document.body.classList.toggle('horizontal-enabled', horizontalEnabled);
    const horizontalPadding = parseFloat(getComputedStyle(perspective).paddingTop);
    const horizontalMax = horizontalEnabled ? Math.max(0, horizontalTrack.scrollWidth - horizontalWindow.clientWidth) : 0;
    const horizontalLead = Math.max(160, Math.min(280, innerHeight * .25));
    const horizontalSpan = Math.max(horizontalMax, innerHeight * 1.6);
    const horizontalTail = Math.max(140, innerHeight * .2);
    const horizontalHeight = horizontalPadding + horizontalSticky.offsetHeight + horizontalLead + horizontalSpan + horizontalTail;
    const horizontalHeightValue = `${Math.ceil(horizontalHeight)}px`;
    if (perspective.style.getPropertyValue('--horizontal-total') !== horizontalHeightValue) {
      perspective.style.setProperty('--horizontal-total', horizontalHeightValue);
    }
    const rw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--road-width'));
    const sideInset = mobile ? (width <= 360 ? 47 : 56) : Math.max(rw * .72, width * .105);
    const left = sideInset, right = width - sideInset;
    const turn = $('.road-turn');
    const turnTop = turn.offsetTop, turnBottom = turnTop + turn.offsetHeight;
    // Keep the inside edge wider than zero: a shallow, full-width cubic can
    // have a radius smaller than half the stroke and fold its inner edge.
    const turnRadius = Math.min((turnBottom - turnTop) / 2, (right - left) / 2);
    const turnMid = (turnTop + turnBottom) / 2;
    const turnStartY = turnMid - turnRadius, turnEndY = turnMid + turnRadius;
    const pivotTop = perspective.offsetTop;
    const exitRadius = Math.max(110, rw * 1.35);
    const exitStartY = pivotTop + 30;
    const exitRoadY = exitStartY + exitRadius;
    // Leave enough road beyond the viewport for the entire rotated sprite.
    const exitX = width + rw * 3.3;
    const exitScrollSpan = Math.max(300, Math.min(650, innerHeight * .65));
    const bend = mobile ? 84 : Math.min(150, width * .14);
    const startY = 52;
    // A single continuous road enters from the left, follows the cabin on the
    // right, sweeps across to the occasion, then opens into the side-view stage.
    const d = [
      `M ${-rw * 2} ${startY}`,
      `L ${right - bend} ${startY}`,
      `Q ${right} ${startY} ${right} ${startY + bend}`,
      `L ${right} ${turnStartY}`,
      `A ${turnRadius} ${turnRadius} 0 0 1 ${right - turnRadius} ${turnMid}`,
      `L ${left + turnRadius} ${turnMid}`,
      `A ${turnRadius} ${turnRadius} 0 0 0 ${left} ${turnEndY}`,
      `L ${left} ${exitStartY}`,
      `A ${exitRadius} ${exitRadius} 0 0 0 ${left + exitRadius} ${exitRoadY}`,
      `L ${exitX} ${exitRoadY}`
    ].join(' ');
    road.setAttribute('width', width);
    road.setAttribute('height', journey.offsetHeight);
    $$('#road path').forEach(path => path.setAttribute('d', d));
    pathLength = surface.getTotalLength();
    samples = Array.from({ length: 2501 }, (_, i) => {
      const distance = pathLength * i / 2500, point = surface.getPointAtLength(distance);
      return { x: point.x, y: point.y, distance };
    });
    const top = journey.getBoundingClientRect().top + window.scrollY;
    metrics = {
      width, mobile, rw, top, startY, pivotTop,
      profileWidth: profileVehicle.offsetWidth,
      endY: samples[samples.length - 1].y,
      turnTop, turnBottom,
      turnStartY, turnEndY,
      turnStartLength: sampledDistanceForY(turnStartY),
      turnEndLength: sampledDistanceForY(turnEndY),
      exitStartY, exitScrollSpan,
      exitStartLength: sampledDistanceForY(exitStartY),
      // Start the side-on entrance only after the overhead vehicle has left.
      profileStart: top + exitStartY + exitScrollSpan - innerHeight * .57,
      profileSpan: Math.max(220, innerHeight * .40),
      horizontal: {
        enabled: horizontalEnabled,
        pinStart: top + pivotTop + horizontalPadding,
        start: top + pivotTop + horizontalPadding + horizontalLead,
        span: horizontalSpan,
        max: horizontalMax,
        end: top + pivotTop + horizontalPadding + horizontalLead + horizontalSpan + horizontalTail,
        stops: horizontalPanels.map(panel => Math.min(panel.offsetLeft, horizontalMax)),
        wordTravel: Math.max(0, sideWord.scrollWidth - width + width * .1)
      },
      endScroll: document.documentElement.scrollHeight - innerHeight,
      chapterTops: chapters.map(el => ({ top: el.getBoundingClientRect().top + scrollY, label: el.dataset.chapter })),
      photos: $$('.cabin-photo img,.occasion-photo img').map(el => ({ el, top: el.parentElement.getBoundingClientRect().top + scrollY, height: el.parentElement.clientHeight }))
    };
    targetLength = distanceForY(renderedScroll + innerHeight * .57 - top);
    renderedLength = targetLength;
    vehicleMotion.rebase(renderedScroll);
    storyMotion.rebase(actualScroll);
    geometryDirty = false;
  }

  function distanceForY(y) {
    if (!samples.length) return 0;
    if (y <= metrics.startY) {
      const firstCorner = samples.find(s => s.y > metrics.startY + 1);
      return (firstCorner?.distance || 0) * smooth((y + 125) / (metrics.startY + 125));
    }
    if (y >= metrics.exitStartY) {
      // Give the horizontal exit its own scroll duration, with continuous
      // entry speed and a gentle stop safely outside the visible viewport.
      const length = pathLength - metrics.exitStartLength;
      const t = clamp((y - metrics.exitStartY) / metrics.exitScrollSpan);
      const slope = Math.min(1, metrics.exitScrollSpan / length);
      const eased = slope * t + (3 - 2 * slope) * t * t + (slope - 2) * t * t * t;
      return lerp(metrics.exitStartLength, pathLength, eased);
    }
    if (y >= metrics.turnStartY && y <= metrics.turnEndY) {
      // Travel through the horizontal part over a span of scrolling instead
      // of jumping across equal-Y samples. Match speed at both vertical joins.
      const height = metrics.turnEndY - metrics.turnStartY;
      const length = metrics.turnEndLength - metrics.turnStartLength;
      const t = clamp((y - metrics.turnStartY) / height);
      const slope = height / length;
      const eased = slope * t + (3 - 3 * slope) * t * t + (2 * slope - 2) * t * t * t;
      return lerp(metrics.turnStartLength, metrics.turnEndLength, eased);
    }
    return sampledDistanceForY(y);
  }

  function sampledDistanceForY(y) {
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].y < y) lo = mid + 1; else hi = mid; }
    const before = samples[Math.max(0, lo - 1)], after = samples[lo];
    const amount = (y - before.y) / Math.max(.001, after.y - before.y);
    return lerp(before.distance, after.distance, clamp(amount));
  }

  function render(time) {
    frame = 0;
    if (geometryDirty || !metrics) measure();
    const elapsed = Math.min(64, previousTime ? time - previousTime : 16.7);
    previousTime = time;
    const ease = motion ? 1 - Math.exp(-elapsed / 62) : 1;
    renderedScroll = lerp(renderedScroll, actualScroll, ease);
    if (Math.abs(renderedScroll - actualScroll) < .12) renderedScroll = actualScroll;
    const y = renderedScroll;
    const totalProgress = clamp(y / Math.max(1, metrics.endScroll));
    progressBar.style.transform = `scaleX(${totalProgress})`;
    chapterPercent.textContent = `${Math.round(totalProgress * 100)}%`;
    indicator.classList.toggle('visible', motion && y > metrics.top - 170 && y < metrics.horizontal.pinStart - 160 && y < metrics.endScroll - 170);
    let active = metrics.chapterTops[0];
    for (const chapter of metrics.chapterTops) if (chapter.top <= y + innerHeight * .48) active = chapter;
    const parts = active.label.split(' / ');
    chapterNumber.textContent = parts[0]; chapterLabel.textContent = parts[1];

    // The pinned scene follows native scrolling directly. A second easing pass
    // after the browser's own momentum made the scene drift and catch up.
    const entrance = smooth((y - metrics.profileStart) / metrics.profileSpan);
    const horizontal = metrics.horizontal;
    const horizontalProgress = horizontal.enabled ? clamp((actualScroll - horizontal.start) / horizontal.span) : 0;
    const horizontalX = horizontalProgress * horizontal.max;
    horizontalTrack.style.transform = horizontal.enabled ? `translate3d(${-horizontalX}px,0,0)` : 'none';
    sideWord.style.transform = horizontal.enabled ? `translate3d(${-horizontalProgress * horizontal.wordTravel}px,0,0)` : 'none';
    horizontalMeter.style.transform = `scaleX(${horizontalProgress})`;
    let nearestPanel = 0;
    horizontal.stops.forEach((stop, i) => {
      if (Math.abs(stop - horizontalX) < Math.abs(horizontal.stops[nearestPanel] - horizontalX)) nearestPanel = i;
    });
    activeHorizontalPanel = nearestPanel;
    const counter = `${String(nearestPanel + 1).padStart(2, '0')} / ${String(horizontalPanels.length).padStart(2, '0')}`;
    if (horizontalCount.textContent !== counter) horizontalCount.textContent = counter;
    const panelLabel = `04 / ${horizontalPanels[nearestPanel].dataset.panelLabel}`;
    if (horizontalChapter.textContent !== panelLabel) horizontalChapter.textContent = panelLabel;
    horizontalPrevious.disabled = nearestPanel === 0;
    horizontalNext.disabled = nearestPanel === horizontalPanels.length - 1;
    targetLength = distanceForY(y + innerHeight * .57 - metrics.top);
    renderedLength = lerp(renderedLength, targetLength, motion ? Math.min(1, ease * 1.45) : 1);
    const point = surface.getPointAtLength(renderedLength);
    const before = surface.getPointAtLength(Math.max(0, renderedLength - 4));
    const after = surface.getPointAtLength(Math.min(pathLength, renderedLength + 4));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI - 90;
    const steering = vehicleMotion.step(y, angle, elapsed, motion);
    const storySteering = storyMotion.step(actualScroll, 0, elapsed, motion);
    traveller.style.transform = `translate3d(${point.x}px,${point.y}px,0) rotate(${steering.heading}deg)`;
    profileVehicle.style.setProperty('--profile-yaw', `${storySteering.yaw}deg`);
    const entered = smooth((y + innerHeight * .65 - metrics.top + 40) / 150);
    traveller.style.opacity = motion ? String(entered) : '0';
    // Both views enter/exit by travelling beyond their clipping boundary.
    // Neither vehicle nor road dissolves while still on screen.
    const spriteWidth = metrics.profileWidth;
    sideVehicle.style.opacity = '1';
    const profileDrift = horizontalProgress * metrics.width * .065;
    sideVehicle.style.transform = motion ? `translate3d(${-(metrics.width + spriteWidth) * (1 - entrance) + profileDrift}px,0,0)` : 'none';
    // Count both entrance travel and scenery passing the pinned van. Steering
    // mirrors the complete vehicle, including the correctly rolling wheels.
    const rollingDistance = (metrics.width + spriteWidth) * entrance + horizontalX + profileDrift;
    const tyreRadius = Math.max(1, spriteWidth * 40 / 768);
    const wheelAngle = storyMotion.roll(rollingDistance, tyreRadius, motion);
    profileVehicle.style.setProperty('--wheel-angle', `${wheelAngle}deg`);
    profileVehicle.style.opacity = '1';
    road.style.opacity = '1';
    if (motion) {
      const heroShift = clamp(y / Math.max(1, metrics.top), 0, 1);
      if (heroVehicle) heroVehicle.style.transform = `translate(calc(-50% + ${heroShift * 50}px),calc(-50% + ${heroShift * 24}px))`;
      for (const photo of metrics.photos) {
        const photoProgress = clamp((y + innerHeight - photo.top) / (innerHeight + photo.height));
        photo.el.style.transform = `translate3d(0,${-photoProgress * photo.height * .075}px,0)`;
      }
    } else {
      metrics.photos.forEach(photo => photo.el.style.transform = 'none');
    }
    if (Math.abs(renderedScroll - actualScroll) > .1 || Math.abs(renderedLength - targetLength) > .15 || steering.turning || storySteering.turning) requestRender();
  }
  function requestRender() { if (!frame) frame = requestAnimationFrame(render); }

  function goToPanel(index, behavior = motion ? 'smooth' : 'instant') {
    if (!metrics || geometryDirty) measure();
    const i = Math.round(clamp(index, 0, horizontalPanels.length - 1));
    const horizontal = metrics.horizontal;
    if (!horizontal.enabled || horizontal.max <= 0) {
      horizontalPanels[i].scrollIntoView({ behavior, block: 'start' });
      return;
    }
    window.scrollTo({ top: horizontal.start + horizontal.stops[i] / horizontal.max * horizontal.span, behavior });
  }
  horizontalPrevious.addEventListener('click', () => goToPanel(activeHorizontalPanel - 1));
  horizontalNext.addEventListener('click', () => goToPanel(activeHorizontalPanel + 1));
  $$('[data-go-panel]').forEach(button => button.addEventListener('click', () => goToPanel(Number(button.dataset.goPanel))));
  horizontalWindow.addEventListener('keydown', event => {
    const directions = { ArrowLeft: activeHorizontalPanel - 1, ArrowRight: activeHorizontalPanel + 1, Home: 0, End: horizontalPanels.length - 1 };
    if (!(event.key in directions) || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    goToPanel(directions[event.key]);
  });
  // Keep keyboard-focused actions visible even when their panel is off-screen.
  horizontalTrack.addEventListener('focusin', event => {
    if (!metrics?.horizontal.enabled) return;
    const panel = event.target.closest('.horizontal-panel');
    const rect = event.target.getBoundingClientRect();
    if (panel && (rect.left < 0 || rect.right > innerWidth)) goToPanel(horizontalPanels.indexOf(panel), 'instant');
  });
  let swipeStart = null;
  horizontalWindow.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') swipeStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  horizontalWindow.addEventListener('pointerup', event => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x, dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (metrics?.horizontal.enabled && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) goToPanel(activeHorizontalPanel + (dx < 0 ? 1 : -1));
  }, { passive: true });
  horizontalWindow.addEventListener('pointercancel', () => { swipeStart = null; }, { passive: true });
  function updateMotion() {
    document.body.classList.toggle('motion-off', !motion);
    geometryDirty = true;
    requestRender();
  }
  window.addEventListener('byjh:motion', event => { motion = event.detail; updateMotion(); });
  window.addEventListener('scroll', () => { actualScroll = scrollPosition(); requestRender(); }, { passive: true });
  window.addEventListener('resize', () => { actualScroll = scrollPosition(); geometryDirty = true; requestRender(); }, { passive: true });
  window.addEventListener('pageshow', () => { actualScroll = scrollPosition(); renderedScroll = actualScroll; geometryDirty = true; requestRender(); });
  new ResizeObserver(() => { geometryDirty = true; requestRender(); }).observe(journey);
  document.fonts.ready.then(() => { geometryDirty = true; requestRender(); });
  $$('img').forEach(img => img.addEventListener('load', () => { geometryDirty = true; requestRender(); }));

  $$('a[href="#services"],a[href="/#services"]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    goToPanel(0);
  }));

  updateMotion();
  if (location.hash === '#services') requestAnimationFrame(() => goToPanel(0, 'instant'));
})();
