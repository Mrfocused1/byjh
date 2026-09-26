/* BYJH logo intro. Loaded synchronously in <head> so the page is covered before
   its first paint. Arriving on any page plays the intro; following an internal
   link fades to the intro colour and navigates, so the next page opens with it.
   Skipped for back/forward, reduced motion, Save-Data, automated browsers and ?nointro. */
(() => {
  'use strict';
  const BG = '#070408';
  const SRC = '/assets/intro/intro-';
  const root = document.documentElement;
  const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  const disabled = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver ||
    (navigator.connection && navigator.connection.saveData) || /[?&]nointro\b/.test(location.search);
  if (disabled) return;

  let overlay = null, video = null, themeMeta = null, previousTheme = null, finished = false;

  function setTheme(on) {
    themeMeta = themeMeta || document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) return;
    if (on) { if (previousTheme === null) previousTheme = themeMeta.content; themeMeta.content = BG; }
    else if (previousTheme !== null) { themeMeta.content = previousTheme; previousTheme = null; }
  }

  function createOverlay() {
    const el = document.createElement('div');
    el.className = 'byjh-intro';
    document.body.append(el);
    return el;
  }

  function removeOverlay(el) {
    if (el === overlay) overlay = null;
    setTimeout(() => el.remove(), 600);
  }

  // ---- Arrival: play the intro over the page ----------------------------
  function pickSource() {
    const cut = matchMedia('(max-aspect-ratio: 1/1)').matches ? 'mobile' : 'desktop';
    const probe = document.createElement('video');
    const webm = probe.canPlayType('video/webm; codecs="vp9"') === 'probably' && !/Apple/.test(navigator.vendor);
    return SRC + cut + (webm ? '.webm' : '.mp4');
  }

  function finish() {
    if (finished) return;
    finished = true;
    root.classList.remove('byjh-intro-on');
    setTheme(false);
    if (overlay) {
      const el = overlay;
      el.classList.add('is-leaving');
      if (video) video.pause();
      removeOverlay(el);
    }
    document.removeEventListener('keydown', onKey, true);
    window.dispatchEvent(new CustomEvent('byjh:intro-done'));
  }

  function onKey(event) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finish(); }
  }

  function play() {
    overlay = createOverlay();
    overlay.append(video);
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'byjh-intro-skip';
    skip.textContent = 'SKIP';
    skip.setAttribute('aria-label', 'Skip intro');
    overlay.append(skip);
    overlay.addEventListener('click', finish);
    document.addEventListener('keydown', onKey, true);
    video.addEventListener('playing', () => overlay && overlay.classList.add('is-playing'), { once: true });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    // Never hold the site hostage: give up if playback has not started, and cap the total.
    setTimeout(() => { if (!video.currentTime) finish(); }, 3500);
    setTimeout(finish, 9000);
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(finish);
  }

  const arriving = !navEntry || navEntry.type !== 'back_forward';
  if (arriving) {
    root.classList.add('byjh-intro-on');
    setTheme(true);
    // Start fetching straight away; the element is attached once <body> exists.
    video = document.createElement('video');
    video.muted = video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.preload = 'auto';
    video.src = pickSource();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', play, { once: true });
    else play();
  }

  // ---- Departure: cover the page, then navigate ---------------------------
  function isTransitionLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return null; // same-page anchor
    if (/\.(mp4|webm|mov|jpe?g|png|webp|avif|gif|svg|pdf)$/i.test(url.pathname)) return null;          // media files
    return url;
  }

  document.addEventListener('click', event => {
    const url = isTransitionLink(event);
    if (!url) return;
    event.preventDefault();
    finish();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    const el = createOverlay();
    el.classList.add('is-entering');
    overlay = el;
    setTheme(true);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    setTimeout(() => { location.href = url.href; }, 320);
  });

  // Coming back through the back/forward cache: drop any cover left from leaving.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    root.classList.remove('byjh-intro-on');
    setTheme(false);
    document.querySelectorAll('.byjh-intro').forEach(el => el.remove());
    overlay = null;
  });
})();
