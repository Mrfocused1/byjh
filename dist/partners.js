/* Partners: the partner logos are the lane lines of a road. They flow past the van on their own,
   run faster while the page is scrolled, and reverse (with the van turning round) when scrolling back up. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

  const road = $('.drive-road');
  if (!road || !window.BYJH || !window.BYJHVehicleMotion) return;
  const partners = $$('.partner').map(li => ({ name: $('span', li).textContent.trim(), img: $('img', li) }));
  $$('.partners-total').forEach(el => { el.textContent = partners.length; });
  const van = $('.road-van'), passing = $('.passing-name'), progressBar = $('.page-progress i');
  const COPIES = 4, BASE_SPEED = 70;

  // Each row repeats the list so it can loop seamlessly; the lower row runs in reverse order.
  const rows = $$('.logo-track').map((track, r) => {
    const order = r ? [...partners].reverse() : partners;
    const logos = [];
    for (let c = 0; c < COPIES; c++) for (const p of order) {
      const img = document.createElement('img');
      img.src = p.img.getAttribute('src'); img.alt = ''; img.decoding = 'async';
      track.append(img);
      logos.push({ el: img, name: p.name, center: 0 });
    }
    return { track, logos, setWidth: 1, phase: r ? .5 : 0 };
  });

  let motion = window.BYJH.motion, dirty = true, visible = true, frame = 0, previousTime = 0;
  let position = 0, speed = BASE_SPEED, lastScroll = window.BYJH.scrollPosition(), velocity = 0, vanX = 0, near = null;
  const vehicleMotion = window.BYJHVehicleMotion.create(lastScroll);

  function measure() {
    for (const row of rows) {
      row.setWidth = Math.max(1, row.track.scrollWidth / COPIES);
      for (const logo of row.logos) {
        // Crests are taller than wordmarks; give them a little more height so they read at the same weight.
        if (logo.el.naturalWidth) logo.el.classList.toggle('tall', logo.el.naturalWidth / logo.el.naturalHeight < 1.4);
        logo.center = logo.el.offsetLeft + logo.el.offsetWidth / 2;
      }
    }
    vanX = van.getBoundingClientRect().left - road.getBoundingClientRect().left;
    dirty = false;
  }

  function render(time) {
    frame = 0;
    if (dirty) measure();
    const dt = Math.min(64, previousTime ? time - previousTime : 16.7) / 1000;
    previousTime = time;

    // Scrolling adds to the road's pace; the direction of travel follows the direction of scrolling.
    const scroll = window.BYJH.scrollPosition();
    velocity += ((scroll - lastScroll) / Math.max(dt, .001) - velocity) * (1 - Math.exp(-dt / .12));
    lastScroll = scroll;
    const steering = vehicleMotion.step(scroll, 0, dt * 1000, motion);
    const target = motion ? steering.direction * (BASE_SPEED + Math.min(1400, Math.abs(velocity) * .9)) : 0;
    speed += (target - speed) * (1 - Math.exp(-dt / .35));
    position += speed * dt;

    let best = Infinity, bestName = passing.textContent;
    for (const row of rows) {
      const offset = ((position + row.phase * row.setWidth) % row.setWidth + row.setWidth) % row.setWidth;
      row.track.style.transform = `translate3d(${-offset}px,0,0)`;
      for (const logo of row.logos) {
        const distance = Math.abs(logo.center - offset - vanX);
        const isNear = distance < 150;
        if (isNear !== logo.el.classList.contains('near')) logo.el.classList.toggle('near', isNear);
        if (distance < best) { best = distance; bestName = logo.name; }
      }
    }
    if (bestName !== near) { near = bestName; passing.textContent = bestName; }

    // A slight drift within the lane, and the van turning to face its direction of travel.
    const sway = motion ? Math.sin(time / 900) * 3 : 0;
    van.style.transform = `translate3d(0,${sway}px,0) rotate(${-90 + steering.yaw}deg)`;
    if (progressBar) progressBar.style.transform = `scaleX(${clamp(scroll / Math.max(1, document.documentElement.scrollHeight - innerHeight))})`;
    if (motion && visible && !document.hidden) request();
  }
  function request() { if (!frame) frame = requestAnimationFrame(render); }

  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) { previousTime = 0; request(); } }).observe(road);
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { dirty = true; request(); }, { passive: true });
  addEventListener('byjh:motion', e => { motion = e.detail; previousTime = 0; request(); });
  document.addEventListener('visibilitychange', () => { previousTime = 0; request(); });
  rows.forEach(row => row.logos.forEach(logo => logo.el.addEventListener('load', () => { dirty = true; request(); }, { once: true })));
  request();
})();
